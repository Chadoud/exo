/**
 * API client for the persistent assistant memory store.
 * Wraps GET/POST/DELETE /memory endpoints.
 */

import { z } from "zod";
import { request, requestValidated } from "./client";
import { HIDDEN_INTERNAL_MEMORY_KEYS } from "../utils/memoryInternalKeys";

export const MEMORY_CATEGORIES = [
  "identity",
  "preferences",
  "projects",
  "context",
  "notes",
  "relationships",
  "wishes",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

const MemoryCategorySchema = z.enum(MEMORY_CATEGORIES);

/** Each category maps arbitrary keys to string values; categories may be absent. */
const PartialMemoryStoreSchema = z
  .object(
    Object.fromEntries(
      MEMORY_CATEGORIES.map((c) => [c, z.record(z.string(), z.string())]),
    ) as Record<MemoryCategory, z.ZodRecord<z.ZodString, z.ZodString>>,
  )
  .partial();

const ScopedMemoryEntrySchema = z.object({
  id: z.number(),
  category: MemoryCategorySchema,
  key: z.string(),
  value: z.string(),
  conversation_id: z.string().nullable(),
  updated_at: z.string(),
  source: z.enum(["manual", "auto"]),
  reviewed: z.boolean(),
  provenance: z.string().nullable().optional(),
  noise_score: z.number().optional(),
  archived_at: z.string().nullable().optional(),
  origin_kind: z.string().nullable().optional(),
  origin_ref: z.string().nullable().optional(),
  origin_url: z.string().nullable().optional(),
  origin_label: z.string().nullable().optional(),
  linked_task_id: z.number().nullable().optional(),
});

const MemorySearchHitSchema = ScopedMemoryEntrySchema.extend({ score: z.number() });

type MemorySearchHit = z.infer<typeof MemorySearchHitSchema>;

type MemoryStore = Record<MemoryCategory, Record<string, string>>;

const EMPTY_MEMORY: MemoryStore = {
  identity: {},
  preferences: {},
  projects: {},
  context: {},
  notes: {},
  relationships: {},
  wishes: {},
};

/** null means global (visible in all conversations). */
export type ScopedMemoryEntry = z.infer<typeof ScopedMemoryEntrySchema>;

export async function fetchMemory(conversationId?: string): Promise<MemoryStore> {
  const path = conversationId
    ? `/memory?conversation_id=${encodeURIComponent(conversationId)}`
    : "/memory";
  const data = await requestValidated(path, PartialMemoryStoreSchema);
  return { ...EMPTY_MEMORY, ...data };
}

/** Fetch all entries across every scope (global + all conversation-scoped) for the Settings UI. */
export async function fetchAllScopedMemory(): Promise<ScopedMemoryEntry[]> {
  return requestValidated("/memory?all_scopes=true", z.array(ScopedMemoryEntrySchema));
}

/** Remove all memory entries scoped to a conversation (called on conversation delete). */
export async function clearConversationMemory(conversationId: string): Promise<void> {
  await request<unknown>(`/memory/conversation/${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });
}

/** Add or update a global memory fact (Memories tab manual add). */
export async function upsertMemoryEntry(
  category: MemoryCategory,
  key: string,
  value: string,
): Promise<void> {
  await request<unknown>("/memory", {
    method: "POST",
    body: JSON.stringify({ category, key, value }),
  });
}

/** Edit an existing entry's value by row id (inline edit). */
export async function editMemoryValue(id: number, value: string): Promise<void> {
  await request<unknown>(`/memory/${id}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

/** Mark an auto-extracted entry as reviewed (or un-review it). */
export async function setMemoryReviewed(id: number, reviewed: boolean): Promise<void> {
  await request<unknown>(`/memory/${id}/reviewed`, {
    method: "PATCH",
    body: JSON.stringify({ reviewed }),
  });
}

/** Delete a single entry by row id. */
export async function deleteMemoryById(id: number): Promise<void> {
  await request<unknown>(`/memory/by-id/${id}`, { method: "DELETE" });
}

const MemoryBatchResultSchema = z.object({
  ok: z.boolean(),
  action: z.enum(["review", "unreview", "delete"]).optional(),
  affected: z.number(),
  ids: z.array(z.number()),
  snapshots: z.array(ScopedMemoryEntrySchema).optional(),
});

type MemoryBatchResult = z.infer<typeof MemoryBatchResultSchema>;

/** Review, unreview, or delete many memory rows in one request. */
export async function batchMemoryAction(
  action: "review" | "unreview" | "delete",
  ids: number[],
): Promise<MemoryBatchResult> {
  return requestValidated("/memory/batch", MemoryBatchResultSchema, {
    method: "POST",
    body: JSON.stringify({ action, ids }),
  });
}

/** Restore rows removed by batch delete (undo). */
export async function restoreMemorySnapshots(
  snapshots: ScopedMemoryEntry[],
): Promise<{ ok: boolean; restored: number }> {
  return requestValidated(
    "/memory/batch/restore",
    z.object({ ok: z.boolean(), restored: z.number() }),
    {
      method: "POST",
      body: JSON.stringify({ snapshots }),
    },
  );
}

const CleanupDomainResultSchema = z.object({
  ok: z.boolean().optional(),
  candidates: z.number().optional(),
  removed: z.number().optional(),
  ids: z.array(z.union([z.number(), z.string()])).optional(),
  skipped: z.string().optional(),
  candidates_delete: z.number().optional(),
  candidates_archive: z.number().optional(),
  deleted: z.number().optional(),
  archived: z.number().optional(),
  delete_ids: z.array(z.string()).optional(),
  archive_ids: z.array(z.string()).optional(),
});

const CleanupSecondBrainNoiseResultSchema = z.object({
  ok: z.boolean(),
  dry_run: z.boolean().optional(),
  include_stale: z.boolean().optional(),
  include_conversations: z.boolean().optional(),
  memories: CleanupDomainResultSchema,
  memories_stale: CleanupDomainResultSchema.optional(),
  tasks: CleanupDomainResultSchema,
  conversations: CleanupDomainResultSchema.optional(),
  total_removed: z.number().optional(),
  total_candidates: z.number(),
});

export type CleanupSecondBrainNoiseResult = z.infer<typeof CleanupSecondBrainNoiseResultSchema>;

/** Remove promotional auto-memories, mail tasks, and optional low-value chats. */
export async function cleanupSecondBrainNoise(options?: {
  dryRun?: boolean;
  delete?: boolean;
  includeStale?: boolean;
  includeConversations?: boolean;
}): Promise<CleanupSecondBrainNoiseResult> {
  return requestValidated("/memory/cleanup-noise", CleanupSecondBrainNoiseResultSchema, {
    method: "POST",
    body: JSON.stringify({
      dry_run: options?.dryRun ?? false,
      delete: options?.delete ?? true,
      include_stale: options?.includeStale ?? false,
      include_conversations: options?.includeConversations ?? false,
    }),
  });
}

const MemoryOpenTargetSchema = z.object({
  ok: z.boolean(),
  kind: z.string(),
  label: z.string(),
  url: z.string().optional(),
  conversation_id: z.string().optional(),
  meeting_id: z.string().optional(),
  task_id: z.number().optional(),
});

export type MemoryOpenTargetResponse = z.infer<typeof MemoryOpenTargetSchema>;

/** Resolve how to open a memory row (may lazy-link to calendar/mail tasks). */
export async function fetchMemoryOpenTarget(id: number): Promise<MemoryOpenTargetResponse> {
  return requestValidated(`/memory/${id}/open-target`, MemoryOpenTargetSchema);
}

/** Lazy-match legacy memories to synced tasks. */
export async function backfillMemoryOrigins(dryRun = false): Promise<{
  ok: boolean;
  dry_run?: boolean;
  matched: number;
  ids: number[];
}> {
  return requestValidated(
    "/memory/backfill-origins",
    z.object({
      ok: z.boolean(),
      dry_run: z.boolean().optional(),
      matched: z.number(),
      ids: z.array(z.number()),
    }),
    {
      method: "POST",
      body: JSON.stringify({ dry_run: dryRun }),
    },
  );
}

/** Relevance-ranked search across all memory entries. */
export async function searchMemory(query: string, limit = 12): Promise<MemorySearchHit[]> {
  return requestValidated(
    `/memory/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    z.array(MemorySearchHitSchema),
  );
}

export async function clearAllMemory(): Promise<void> {
  await request<unknown>("/memory", {
    method: "DELETE",
    body: JSON.stringify({ confirmed: true }),
  });
}

const PROMPT_MAX_CHARS = 2000;

/** Format memory as a compact prompt block, matching backend format_memory_for_prompt(). */
export function formatMemoryForPrompt(store: MemoryStore): string {
  const header = "=== Persistent Memory (remembered from previous sessions) ===";
  const footer = "=== End of memory ===";
  const budget = PROMPT_MAX_CHARS - header.length - footer.length - 2;

  const lines: string[] = [];
  let used = 0;
  let truncated = false;

  for (const cat of Object.keys(store) as MemoryCategory[]) {
    const pairs = Object.entries(store[cat] ?? {}).filter(
      ([key]) => !HIDDEN_INTERNAL_MEMORY_KEYS.has(key),
    );
    if (pairs.length === 0) continue;
    const catLine = `[${cat.toUpperCase()}]`;
    if (used + catLine.length + 1 > budget) { truncated = true; break; }
    lines.push(catLine);
    used += catLine.length + 1;
    for (const [k, v] of pairs) {
      const entry = `  ${k}: ${v}`;
      if (used + entry.length + 1 > budget) { truncated = true; break; }
      lines.push(entry);
      used += entry.length + 1;
    }
    if (truncated) break;
  }

  if (lines.length === 0) return "";
  const parts = [header, ...lines];
  if (truncated) parts.push("  ... (older entries omitted)");
  parts.push(footer);
  return parts.join("\n");
}
