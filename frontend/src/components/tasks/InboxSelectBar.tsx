import { useI18n } from "../../i18n/I18nContext";

type InboxSelectBarProps = {
  selectedCount: number;
  onDismiss: () => void;
  onSelectAll: () => void;
  onCancel: () => void;
};

/** Multi-select actions for Inbox — dismiss only; undo replaces confirm. */
export default function InboxSelectBar({
  selectedCount,
  onDismiss,
  onSelectAll,
  onCancel,
}: InboxSelectBarProps) {
  const { t } = useI18n();
  const hasSelection = selectedCount > 0;
  const countLabel = t(selectedCount === 1 ? "tasks.selectedOne" : "tasks.selectedOther", {
    n: selectedCount,
  });

  return (
    <div
      className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-bg-card/95 px-3 py-2.5 shadow-md backdrop-blur-sm"
      role="toolbar"
      aria-label={t("todo.inbox.selectToolbarAria")}
    >
      <p className="text-sm font-medium text-text-primary" aria-live="polite">
        {countLabel}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onDismiss}
          className="rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-button-hover disabled:opacity-50"
        >
          {t("todo.inbox.dismiss")}
        </button>
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
        >
          {t("tasks.selectAll")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-text-primary"
        >
          {t("tasks.cancel")}
        </button>
      </div>
    </div>
  );
}
