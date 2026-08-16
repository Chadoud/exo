import { useI18n } from "../../i18n/I18nContext";

type TaskSelectBarProps = {
  selectedCount: number;
  onMarkDone: () => void;
  onMarkNotDone: () => void;
  onRemove: () => void;
  onSelectAll: () => void;
  onCancel: () => void;
};

/** Multi-select actions — complete, reopen, or remove from EXO. */
export default function TaskSelectBar({
  selectedCount,
  onMarkDone,
  onMarkNotDone,
  onRemove,
  onSelectAll,
  onCancel,
}: TaskSelectBarProps) {
  const { t } = useI18n();
  const hasSelection = selectedCount > 0;
  const countLabel = t(selectedCount === 1 ? "tasks.selectedOne" : "tasks.selectedOther", {
    n: selectedCount,
  });

  return (
    <div
      className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-bg-card/95 px-3 py-2.5 shadow-md backdrop-blur-sm"
      role="toolbar"
      aria-label={t("tasks.selectToolbarAria")}
    >
      <p className="text-sm font-medium text-text-primary" aria-live="polite">
        {countLabel}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onMarkDone}
          className="rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-button-hover disabled:opacity-50"
        >
          {t("tasks.markComplete")}
        </button>
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onMarkNotDone}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-secondary disabled:opacity-50"
        >
          {t("tasks.markIncomplete")}
        </button>
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onRemove}
          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
        >
          {t("tasks.remove")}
        </button>
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
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
