/**
 * API client for the proactive layer: daily digest + notification center (nudges).
 */

import { z } from "zod";
import { request, requestValidated } from "./client";

const DigestSchema = z.object({
  id: z.number(),
  date: z.string(),
  created_at: z.string(),
  headline: z.string(),
  highlights: z.array(z.string()).optional().default([]),
  decisions: z.array(z.string()).optional().default([]),
  unresolved: z.array(z.string()).optional().default([]),
  focus_tomorrow: z.array(z.string()).optional().default([]),
  counts: z.record(z.string(), z.number()).optional(),
  llm: z.boolean().optional(),
});

export type Digest = z.infer<typeof DigestSchema>;

export function generateDigest(): Promise<Digest> {
  return requestValidated("/digest/generate", DigestSchema, { method: "POST" });
}

export async function fetchLatestDigest(): Promise<Digest | null> {
  try {
    return await requestValidated("/digest/latest", DigestSchema);
  } catch {
    return null; // 404 when no digest exists yet
  }
}

const NudgeSchema = z.object({
  id: z.number(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  meta: z.record(z.string(), z.unknown()),
  dismissed: z.boolean(),
  created_at: z.string(),
});

export type Nudge = z.infer<typeof NudgeSchema>;

export function fetchNudges(): Promise<Nudge[]> {
  return requestValidated("/nudges", z.array(NudgeSchema));
}

export async function dismissNudge(id: number): Promise<void> {
  await request<unknown>(`/nudges/${id}/dismiss`, { method: "POST" });
}

export async function restoreNudge(id: number): Promise<void> {
  await request<unknown>(`/nudges/${id}/restore`, { method: "POST" });
}

export async function dismissAllNudges(): Promise<number[]> {
  const body = await request<{ ids?: number[] }>("/nudges/dismiss-all", { method: "POST" });
  return Array.isArray(body.ids) ? body.ids : [];
}

const SchedulerJobSchema = z.object({
  name: z.string(),
  interval_sec: z.number(),
  last_run_at: z.string().nullable(),
  last_error: z.string().nullable(),
});

const SchedulerStatusSchema = z.object({
  running: z.boolean(),
  jobs: z.array(SchedulerJobSchema),
});

export async function fetchSchedulerStatus(): Promise<z.infer<typeof SchedulerStatusSchema> | null> {
  try {
    return await requestValidated("/proactive/scheduler/status", SchedulerStatusSchema);
  } catch {
    return null;
  }
}

const AgentFailureSchema = z.object({
  id: z.number(),
  content: z.string(),
  created_at: z.string(),
});

export type AgentFailure = z.infer<typeof AgentFailureSchema>;

export function fetchAgentFailures(): Promise<AgentFailure[]> {
  return requestValidated("/proactive/failures", z.array(AgentFailureSchema)).catch(() => []);
}

export async function dismissAgentFailure(id: number): Promise<void> {
  await request<unknown>(`/proactive/failures/${id}/dismiss`, { method: "POST" });
}

export async function restoreAgentFailure(id: number): Promise<void> {
  await request<unknown>(`/proactive/failures/${id}/restore`, { method: "POST" });
}
