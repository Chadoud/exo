import type { Nudge } from "../api/proactive";
import type { AgentFailure } from "../api/proactive";

const PREP_DUE_PREFIX = /^Task due soon: Prepare for: /i;
const ISO_DUE_IN_BODY = /Due (\d{4}-\d{2}-\d{2}T[^\s.]+)\.?/i;

/** Nudge title shown when agent runs fail — redundant once failures are listed above. */
export const FAILED_TASKS_NUDGE_TITLE = /^Review recent failed tasks$/i;

export type HomeAttentionItem = {
  key: string;
  title: string;
  body?: string;
  nudgeIds: number[];
  kind: "memory_review" | "task_due" | "nudge";
};

function normalizeNudgeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** Drop failed-task nudges when the failures section already covers them. */
export function filterInboxNudges(nudges: Nudge[], failureCount: number): Nudge[] {
  if (failureCount <= 0) return nudges;
  return nudges.filter((n) => !FAILED_TASKS_NUDGE_TITLE.test(n.title));
}

/** Count distinct inbox rows (grouped nudges + failures + memory review banner). */
export function countInboxAttentionItems(
  nudges: Nudge[],
  failures: AgentFailure[],
  needsReview: number,
  mailReplyCount = 0,
  maxNudges = 20,
): number {
  const filtered = filterInboxNudges(nudges, failures.length);
  const grouped = buildHomeAttentionFromNudges(filtered, maxNudges);
  return grouped.length + failures.length + (needsReview > 0 ? 1 : 0) + mailReplyCount;
}

/** Human-readable due line instead of raw ISO timestamps in nudge bodies. */
export function formatNudgeBody(body: string): string {
  if (!body) return "";
  return body.replace(ISO_DUE_IN_BODY, (_, iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return `Due ${iso}`;
    const formatted = d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Due ${formatted}`;
  });
}

/** Collapse repetitive meeting-prep nudges into one row. Cap total items. */
export function buildHomeAttentionFromNudges(nudges: Nudge[], maxItems = 5): HomeAttentionItem[] {
  const items: HomeAttentionItem[] = [];
  const prep: Nudge[] = [];
  const rest: Nudge[] = [];

  for (const n of nudges) {
    if (PREP_DUE_PREFIX.test(n.title)) prep.push(n);
    else rest.push(n);
  }

  if (prep.length > 0) {
    const labels = prep.map((n) => n.title.replace(PREP_DUE_PREFIX, "").trim()).filter(Boolean);
    items.push({
      key: "prep-group",
      title:
        prep.length === 1
          ? prep[0].title
          : `Meeting prep · ${prep.length} reminders`,
      body: labels.length > 0 ? labels.join(" · ") : undefined,
      nudgeIds: prep.map((n) => n.id),
      kind: "task_due",
    });
  }

  for (const n of rest) {
    if (items.length >= maxItems) break;
    const titleKey = normalizeNudgeTitle(n.title);
    const existing = items.find((item) => normalizeNudgeTitle(item.title) === titleKey);
    if (existing) {
      existing.nudgeIds.push(n.id);
      if (n.body && !existing.body?.includes(n.body)) {
        existing.body = existing.body ? `${existing.body} · ${formatNudgeBody(n.body)}` : formatNudgeBody(n.body);
      }
      continue;
    }
    items.push({
      key: `nudge-${n.id}`,
      title: n.title,
      body: formatNudgeBody(n.body),
      nudgeIds: [n.id],
      kind: n.kind === "task_due" || n.kind === "due_task" ? "task_due" : "nudge",
    });
  }

  return items.slice(0, maxItems);
}
