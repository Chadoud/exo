import TaskSyncAccountsButton from "./TaskSyncAccountsButton";

type TaskPanelHeaderActionsProps = {
  showSelect: boolean;
  selectLabel: string;
  onSelect: () => void;
  showSync: boolean;
  syncDisabled: boolean;
  syncLabel: string;
  syncTitle: string;
  onSync: () => void;
};

/** Select + account sync in the Tasks header. */
export default function TaskPanelHeaderActions({
  showSelect,
  selectLabel,
  onSelect,
  showSync,
  syncDisabled,
  syncLabel,
  syncTitle,
  onSync,
}: TaskPanelHeaderActionsProps) {
  if (!showSelect && !showSync) return null;
  return (
    <>
      {showSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          {selectLabel}
        </button>
      ) : null}
      {showSync ? (
        <TaskSyncAccountsButton
          disabled={syncDisabled}
          label={syncLabel}
          title={syncTitle}
          onClick={onSync}
        />
      ) : null}
    </>
  );
}
