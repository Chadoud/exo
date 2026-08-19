import { restoreAgentFailure, restoreNudge } from "../api/proactive";
import { restoreMailReply } from "../api/mailReplies";
import type { InboxKind } from "./inboxKeys";

export type InboxRestoreItem = { kind: InboxKind; id: number };

export async function restoreInboxItems(items: InboxRestoreItem[]): Promise<void> {
  for (const item of items) {
    if (item.kind === "nudge") await restoreNudge(item.id);
    else if (item.kind === "failure") await restoreAgentFailure(item.id);
    else await restoreMailReply(item.id);
  }
}
