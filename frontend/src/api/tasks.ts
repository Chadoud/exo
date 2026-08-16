/**
 * API client for the task / action-item store.
 * Tasks are auto-extracted (Omi-style) — not manually composed in the UI.
 */

import { z } from "zod";
import { request, requestValidated } from "./client";

const TASK_PRIORITIES = ["low", "normal", "high"] as const;

const TaskSchema = z.object({
  id: z.number(),
  description: z.string(),
  due_at: z.string().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  completed: z.boolean(),
  completed_at: z.string().nullable(),
  source: z.string(),
  source_conversation_id: z.string().nullable(),
  external_id: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Task = z.infer<typeof TaskSchema>;

const SyncResultSchema = z.object({
  ok: z.boolean(),
  total_created: z.number(),
  created: z.record(z.string(), z.number()),
  statuses: z.record(z.string(), z.string()).optional(),
});

export async function fetchTasks(
  includeCompleted = true,
  options?: { excludeManual?: boolean; mapEligible?: boolean },
): Promise<Task[]> {
  const excludeManual = options?.excludeManual ?? true;
  const mapEligible = options?.mapEligible ?? false;
  return requestValidated(
    `/tasks?include_completed=${includeCompleted ? "true" : "false"}&exclude_manual=${excludeManual ? "true" : "false"}&map_eligible=${mapEligible ? "true" : "false"}`,
    z.array(TaskSchema),
  );
}

export async function syncTasksFromIntegrations(): Promise<z.infer<typeof SyncResultSchema>> {
  return requestValidated("/tasks/sync", SyncResultSchema, { method: "POST" });
}

export async function setTaskCompleted(id: number, completed: boolean): Promise<Task> {
  return requestValidated(`/tasks/${id}/done`, TaskSchema, {
    method: "PATCH",
    body: JSON.stringify({ completed }),
  });
}

/** Remove from EXO. Calendar/mail stay; the same source will not come back on sync. */
export async function deleteTask(id: number): Promise<void> {
  await request<unknown>(`/tasks/${id}`, { method: "DELETE" });
}

const TaskOpenTargetSchema = z.object({
  ok: z.boolean(),
  kind: z.string(),
  label: z.string(),
  url: z.string().optional(),
  conversation_id: z.string().optional(),
  meeting_id: z.string().optional(),
  task_id: z.number().optional(),
});

/** Resolve how to open a task's source (mail, calendar, or chat). */
export async function fetchTaskOpenTarget(id: number): Promise<z.infer<typeof TaskOpenTargetSchema>> {
  return requestValidated(`/tasks/${id}/open-target`, TaskOpenTargetSchema);
}
