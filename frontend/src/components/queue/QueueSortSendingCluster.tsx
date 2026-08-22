import { SECONDARY_BTN_CLASS } from "../../utils/styles";

type QueueSortSendingClusterProps = {
  previewCount: number | null;
  stallVisible: boolean;
  stallTranslationKey: string;
  onCancel: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

/** In-flight sort start — one status line, indeterminate track, Cancel. */
export function QueueSortSendingCluster({
  previewCount,
  stallVisible,
  stallTranslationKey,
  onCancel,
  t,
}: QueueSortSendingClusterProps) {
  const status =
    previewCount === 1
      ? t("queue.sendingAiOne")
      : previewCount !== null
        ? t("queue.sendingAi", { count: previewCount })
        : t("queue.workspaceRunBatchStarting");

  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-bg-secondary/40 px-4 py-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t("queue.workspaceSendingClusterAria")}
    >
      <p className="text-center text-sm font-medium text-text-primary">{status}</p>
      <div className="relative h-2 w-full min-w-0 overflow-hidden rounded-full bg-border" aria-hidden>
        <div className="absolute top-0 bottom-0 w-[30%] rounded-full bg-accent animate-prepIndeterminate" />
      </div>
      {stallVisible ? (
        <p className="text-center text-2xs text-muted/85">{t(stallTranslationKey)}</p>
      ) : null}
      <button type="button" onClick={onCancel} className={`${SECONDARY_BTN_CLASS} px-4`}>
        {t("queue.workspaceRunBatchCancel")}
      </button>
    </div>
  );
}
