import type { MemoryCategory, ScopedMemoryEntry } from "../api/memory";
import { memoryOriginProviderKey } from "./memoryOrigin";
import { MEMORY_SUB_TAB_STORAGE_KEY, MEMORY_LIST_EXPANDED_STORAGE_KEY } from "../constants";
import { HIDDEN_INTERNAL_MEMORY_KEYS } from "./memoryInternalKeys";

export { HIDDEN_INTERNAL_MEMORY_KEYS } from "./memoryInternalKeys";

export type MemorySubTab = "overview" | "activity" | "map";

/** Align with backend/signal_quality/constants.py — keep in sync when thresholds change. */
export const AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD = 0.35;

/** Needs review triage ceiling — aligned with hidden threshold (no orphaned rows). */
const AUTO_MEMORY_TRIAGE_MAX_NOISE = 0.35;

export function loadMemorySubTab(): MemorySubTab {
  try {
    const v = localStorage.getItem(MEMORY_SUB_TAB_STORAGE_KEY);
    if (v === "activity" || v === "map" || v === "overview") return v;
    if (v === "facts") return "overview";
  } catch {
    /* ignore */
  }
  return "overview";
}

export function persistMemorySubTab(tab: MemorySubTab): void {
  try {
    localStorage.setItem(MEMORY_SUB_TAB_STORAGE_KEY, tab);
  } catch {
    /* ignore */
  }
}

/** Whether the full memory browse list is expanded on the Overview tab. */
export function loadMemoryListExpanded(): boolean {
  try {
    return sessionStorage.getItem(MEMORY_LIST_EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistMemoryListExpanded(expanded: boolean): void {
  try {
    sessionStorage.setItem(MEMORY_LIST_EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export type MemoryFactsFilter = "all" | "aboutYou" | "work" | "needsReview";

/** Internal preference keys — shown with plain labels in Facts, not raw values. */
const STARTUP_BRIEFING_CONSENT_KEY = "startup_briefing_consent";

type SystemMemoryLabelKey =
  | "memories.systemFacts.startupBriefingGranted"
  | "memories.systemFacts.startupBriefingDeclined";

/** i18n key for app-managed memory rows, or null for normal user facts. */
export function systemMemoryLabelKey(entry: ScopedMemoryEntry): SystemMemoryLabelKey | null {
  if (entry.category !== "preferences" || entry.key !== STARTUP_BRIEFING_CONSENT_KEY) {
    return null;
  }
  if (entry.value === "granted") return "memories.systemFacts.startupBriefingGranted";
  if (entry.value === "declined") return "memories.systemFacts.startupBriefingDeclined";
  return null;
}

export function isSystemManagedMemory(entry: ScopedMemoryEntry): boolean {
  return systemMemoryLabelKey(entry) !== null;
}

/** Migration flags — never show in Memory browse. Keep the vault row. */
export function isHiddenInternalMemory(entry: ScopedMemoryEntry): boolean {
  return HIDDEN_INTERNAL_MEMORY_KEYS.has(entry.key);
}

const ABOUT_YOU_CATEGORIES = new Set<MemoryCategory>([
  "identity",
  "preferences",
  "relationships",
]);

const WORK_CATEGORIES = new Set<MemoryCategory>(["projects", "context"]);

/** Whether a row should appear in prompts / trusted All view (mirrors backend is_prompt_visible). */
export function isPromptVisibleMemory(entry: ScopedMemoryEntry): boolean {
  if (isHiddenInternalMemory(entry)) return false;
  if (entry.archived_at) return false;
  if (entry.source === "manual") return true;
  if (entry.reviewed) return true;
  return (entry.noise_score ?? 0) < AUTO_MEMORY_HIDDEN_NOISE_THRESHOLD;
}

/** Unreviewed auto rows hidden from All — cleanup or discard only. */
function isHiddenUnreviewedSuggestion(entry: ScopedMemoryEntry): boolean {
  return entry.source === "auto" && !entry.reviewed && !isPromptVisibleMemory(entry);
}

/** Map a user-facing filter to whether an entry should be visible. */
export function memoryEntryMatchesFilter(
  entry: ScopedMemoryEntry,
  filter: MemoryFactsFilter,
): boolean {
  if (isHiddenInternalMemory(entry)) return false;
  if (filter === "all") return isPromptVisibleMemory(entry);
  if (filter === "needsReview") {
    return (
      entry.source === "auto" &&
      !entry.reviewed &&
      (entry.noise_score ?? 0) < AUTO_MEMORY_TRIAGE_MAX_NOISE
    );
  }
  if (filter === "aboutYou") return ABOUT_YOU_CATEGORIES.has(entry.category);
  if (filter === "work") return WORK_CATEGORIES.has(entry.category);
  return true;
}

/** Derive a stable memory key from free-form text (happy-path add). */
export function memoryKeyFromText(text: string, maxLen = 48): string {
  const words = text.trim().toLowerCase().split(/\s+/).slice(0, 6);
  const slug = words
    .join("_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, maxLen);
  return slug || `note_${Date.now()}`;
}

/** Highlight query matches in memory value text (returns HTML-safe segments). */
export function splitHighlightSegments(
  text: string,
  query: string,
): { text: string; highlight: boolean }[] {
  const q = query.trim();
  if (!q || q.length < 2) return [{ text, highlight: false }];
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return [{ text, highlight: false }];
  const out: { text: string; highlight: boolean }[] = [];
  if (idx > 0) out.push({ text: text.slice(0, idx), highlight: false });
  out.push({ text: text.slice(idx, idx + q.length), highlight: true });
  if (idx + q.length < text.length) {
    out.push({ text: text.slice(idx + q.length), highlight: false });
  }
  return out;
}

/** Plain-language source line for a memory row (prefers origin envelope over generic provenance). */
export function formatMemorySourceLine(
  entry: ScopedMemoryEntry,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (entry.source !== "auto") return null;
  if (isHiddenUnreviewedSuggestion(entry)) {
    return t("memories.looksPromotional");
  }
  const providerKey = memoryOriginProviderKey(entry.origin_kind);
  if (providerKey && entry.origin_label?.trim()) {
    return `${t(providerKey)} · ${entry.origin_label.trim()}`;
  }
  const legacyKey = memoryProvenanceLabelKey(entry);
  return legacyKey ? t(legacyKey) : null;
}

/** Map provenance / source to an i18n label key for memory rows. */
function memoryProvenanceLabelKey(entry: ScopedMemoryEntry): string | null {
  if (entry.source !== "auto") return null;
  if (isHiddenUnreviewedSuggestion(entry)) {
    return "memories.looksPromotional";
  }
  switch (entry.provenance) {
    case "mail":
      return "memories.fromMail";
    case "calendar":
      return "memories.fromCalendar";
    case "meeting":
      return "memories.fromMeeting";
    case "chat":
    default:
      return "memories.fromChat";
  }
}

/** Count auto-extracted memories awaiting user review (excludes likely promotional). */
export function countNeedsReview(entries: ScopedMemoryEntry[]): number {
  return entries.filter((e) => memoryEntryMatchesFilter(e, "needsReview")).length;
}

export function countHiddenUnreviewedSuggestions(entries: ScopedMemoryEntry[]): number {
  return entries.filter((e) => isHiddenUnreviewedSuggestion(e)).length;
}

export type MemoryProvenanceGroup = "mail" | "chat" | "calendar" | "meeting" | "other";

const PROVENANCE_GROUP_ORDER: MemoryProvenanceGroup[] = [
  "mail",
  "chat",
  "calendar",
  "meeting",
  "other",
];

/** Bucket a review queue by where the fact came from. */
export function memoryProvenanceGroup(entry: ScopedMemoryEntry): MemoryProvenanceGroup {
  switch (entry.provenance) {
    case "mail":
      return "mail";
    case "calendar":
      return "calendar";
    case "meeting":
      return "meeting";
    case "chat":
      return "chat";
    default:
      return "other";
  }
}

/** i18n key under `memories.groups.*` for a provenance bucket. */
export function memoryProvenanceGroupLabelKey(group: MemoryProvenanceGroup): string {
  return `memories.groups.${group}`;
}

export function groupMemoryEntriesByProvenance(
  entries: ScopedMemoryEntry[],
): { group: MemoryProvenanceGroup; entries: ScopedMemoryEntry[] }[] {
  const buckets = new Map<MemoryProvenanceGroup, ScopedMemoryEntry[]>();
  for (const entry of entries) {
    const group = memoryProvenanceGroup(entry);
    buckets.set(group, [...(buckets.get(group) ?? []), entry]);
  }
  return PROVENANCE_GROUP_ORDER.filter((group) => buckets.has(group)).map((group) => ({
    group,
    entries: buckets.get(group)!,
  }));
}

/** Intersect cleanup dry-run ids with visible global facts. */
export function promotionalCandidateIds(
  entries: ScopedMemoryEntry[],
  cleanupIds: number[],
): number[] {
  const allowed = new Set(entries.map((e) => e.id));
  return cleanupIds.filter((id) => allowed.has(id));
}

/** DOM ids for Memory “all sections” scroll — keep in sync with MemoriesPanel. */
export const MEMORY_SCROLL_SECTION_IDS = [
  "memory-section-overview",
  "memory-section-map",
  "memory-section-activity",
] as const;

export function memorySubTabForScrollSection(sectionId: string): MemorySubTab | null {
  switch (sectionId) {
    case "memory-section-overview":
      return "overview";
    case "memory-section-activity":
      return "activity";
    case "memory-section-map":
      return "map";
    default:
      return null;
  }
}
