import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext";
import { buildSyncStatusLines, totalNewFromCreated } from "../../utils/syncStatusLabels";

interface Props {
  open: boolean;
  onClose: () => void;
  lastSyncAt: string | null;
  syncReport: {
    created: Record<string, number>;
    statuses?: Record<string, string>;
  } | null;
  onOpenSources?: () => void;
  onSync: () => void;
  syncing: boolean;
}

export default function SyncStatusDrawer({
  open,
  onClose,
  lastSyncAt,
  syncReport,
  onOpenSources,
  onSync,
  syncing,
}: Props) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const lines = buildSyncStatusLines(syncReport?.statuses, syncReport?.created, {
    sourceLabel: (key) => {
      const map: Record<string, string> = {
        gmail: t("tasks.sources.gmail"),
        outlook: t("tasks.sources.outlook"),
        google_calendar: t("tasks.sources.googleCalendar"),
        outlook_calendar: t("tasks.sources.outlookCalendar"),
      };
      return map[key] ?? key;
    },
    statusNew: (n) => t("tasks.statusNew", { n }),
    statusNotConnected: t("tasks.statusNotConnected"),
    statusUnavailable: t("tasks.statusUnavailable"),
  });

  const totalNew = totalNewFromCreated(syncReport?.created);
  const allNotConnected =
    syncReport?.statuses &&
    Object.values(syncReport.statuses).every((s) => s === "not_connected");

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-sm flex-col border-l border-border bg-bg-primary shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">{t("tasks.syncDrawerTitle")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:text-text-primary"
            aria-label={t("brainMap.closeAria")}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {lastSyncAt ? (
            <p className="text-xs text-muted">
              {t("tasks.lastSynced", {
                time: new Date(lastSyncAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              })}
              {totalNew === 0 ? t("tasks.noNewItems") : t("tasks.newCount", { n: totalNew })}
            </p>
          ) : (
            <p className="text-xs text-muted">{t("tasks.syncFromAccounts")}</p>
          )}
          {lines.length > 0 ? (
            <ul className="space-y-2">
              {lines.map((line) => (
                <li
                  key={line.sourceKey}
                  className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
                >
                  {line.message}
                  {line.showConnect && onOpenSources ? (
                    <button
                      type="button"
                      onClick={onOpenSources}
                      className="ml-1 text-accent hover:underline"
                    >
                      {t("tasks.connectInSources")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {allNotConnected && onOpenSources ? (
            <button
              type="button"
              onClick={onOpenSources}
              className="text-xs text-accent hover:underline"
            >
              {t("tasks.connectCta")}
            </button>
          ) : null}
        </div>
        <div className="space-y-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => void onSync()}
            disabled={syncing}
            className="w-full rounded-lg bg-button-primary py-2 text-sm font-medium text-white hover:bg-button-hover disabled:opacity-50"
          >
            {syncing ? t("tasks.syncing") : t("tasks.syncAccounts")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
