import { refreshMailReplies } from "../api/mailReplies";
import {
  forgetIntegrationTasks,
  resumeIntegrationSource,
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

/** Unpause harvest after the user connects that account again on this computer. */
export function resumeIntegrationSourcesBestEffort(
  sources: readonly ForgettableTaskSource[],
): void {
  void (async () => {
    for (const source of sources) {
      try {
        await resumeIntegrationSource(source);
      } catch {
        /* backend offline — next successful connect retries */
      }
    }
  })();
}

/** Harvest after a new mailbox so leftover rows from the previous account drop immediately. */
export function refreshIntegrationTasksBestEffort(): void {
  void syncTasksFromIntegrations().catch(() => undefined);
}

/** Force a Replies harvest so a new Gmail mailbox drops leftover cards immediately. */
export function refreshMailRepliesBestEffort(): void {
  void refreshMailReplies().catch(() => undefined);
}