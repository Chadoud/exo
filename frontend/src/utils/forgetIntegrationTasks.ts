import { refreshMailReplies } from "../api/mailReplies";
import {
  forgetIntegrationTasks,
  syncTasksFromIntegrations,
  type ForgettableTaskSource,
} from "../api/tasks";

/** Best-effort wipe after desktop disconnect. Next account-change sync is the fallback. */
export async function forgetIntegrationSourcesBestEffort(
  sources: readonly ForgettableTaskSource[],
): Promise<void> {
  for (const source of sources) {
    try {
      await forgetIntegrationTasks(source);
    } catch {
      /* backend offline — identity check on the next To Do sync drops leftovers */
    }
  }
}

/** Harvest after a new mailbox so leftover rows from the previous account drop immediately. */
export function refreshIntegrationTasksBestEffort(): void {
  void syncTasksFromIntegrations().catch(() => undefined);
}

/** Force a Replies harvest so a new Gmail mailbox drops leftover cards immediately. */
export function refreshMailRepliesBestEffort(): void {
  void refreshMailReplies().catch(() => undefined);
}