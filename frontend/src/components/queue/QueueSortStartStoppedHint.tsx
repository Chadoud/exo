import type { SortStartStoppedReason } from "./sortStartChrome";

type QueueSortStartStoppedHintProps = {
  reason: SortStartStoppedReason;
  t: (key: string, params?: Record<string, string | number>) => string;
};

/** Start settled without a job — static line, no spinner. */
export function QueueSortStartStoppedHint({ reason, t }: QueueSortStartStoppedHintProps) {
  const text =
    reason === "canceled"
      ? t("queue.sortStartCanceled")
      : t("queue.sortStartDidNotStart", { action: t("queue.workspaceRunBatch") });

  return (
    <p className="text-center text-sm text-text-primary" role="status" aria-live="polite">
      {text}
    </p>
  );
}
