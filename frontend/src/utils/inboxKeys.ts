import type { AgentFailure, Nudge } from "../api/proactive";
import type { MailReplyItem } from "../api/mailReplies";
import { filterInboxNudges } from "./homeFeed";

export type InboxKind = "nudge" | "failure" | "mail";
export type InboxKey = `${InboxKind}:${number}`;

export function inboxKey(kind: InboxKind, id: number): InboxKey {
  return `${kind}:${id}`;
}

type InboxItemRef = { kind: InboxKind; id: number };

export function parseInboxKey(key: string): InboxItemRef | null {
  const sep = key.indexOf(":");
  if (sep <= 0) return null;
  const kind = key.slice(0, sep);
  const id = Number(key.slice(sep + 1));
  if ((kind !== "nudge" && kind !== "failure" && kind !== "mail") || !Number.isInteger(id)) {
    return null;
  }
  return { kind, id };
}

export function selectedInboxItems(keys: string[]): InboxItemRef[] {
  return keys.map(parseInboxKey).filter((item): item is InboxItemRef => item != null);
}

type InboxKeyKinds = {
  failures?: boolean;
  mail?: boolean;
  nudges?: boolean;
};

export function collectInboxKeys(
  inbox: {
    failures: AgentFailure[];
    mailReplies: MailReplyItem[];
    nudges: Nudge[];
  },
  kinds: InboxKeyKinds = {},
): InboxKey[] {
  const includeFailures = kinds.failures !== false;
  const includeMail = kinds.mail !== false;
  const includeNudges = kinds.nudges !== false;
  const keys: InboxKey[] = [];
  if (includeFailures) {
    for (const failure of inbox.failures) keys.push(inboxKey("failure", failure.id));
  }
  if (includeMail) {
    for (const mail of inbox.mailReplies) keys.push(inboxKey("mail", mail.id));
  }
  if (includeNudges) {
    for (const nudge of filterInboxNudges(inbox.nudges, inbox.failures.length)) {
      keys.push(inboxKey("nudge", nudge.id));
    }
  }
  return keys;
}
