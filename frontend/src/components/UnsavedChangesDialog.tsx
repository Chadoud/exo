import ModalShell from "./ModalShell";
import { MODAL_FOOTER_ROW_CLASS } from "../utils/styles";

const DIALOG_FOOTER_BTN =
  "inline-flex shrink-0 items-center justify-center min-h-[2.5rem] px-4 py-2 rounded-lg text-sm font-medium leading-snug transition-colors";

/** Confirm leaving with unsaved work — Cancel stays, Discard reverts, Save keeps changes (when applicable). */
export default function UnsavedChangesDialog({
  open,
  title = "Discard changes?",
  message = "You have unsaved changes. What would you like to do?",
  cancelLabel = "Keep editing",
  discardLabel = "Don't save",
  saveLabel = "Save",
  showSave = true,
  onCancel,
  onDiscard,
  onSave,
}: {
  open: boolean;
  title?: string;
  message?: string;
  cancelLabel?: string;
  discardLabel?: string;
  saveLabel?: string;
  /** If false, only Cancel + Discard (e.g. revert-only flows). */
  showSave?: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave?: () => void;
}) {
  if (!open) return null;

  return (
    <ModalShell
      title={title}
      onClose={onCancel}
      maxWidthClass="max-w-lg"
      footer={
        <div
          className={`${MODAL_FOOTER_ROW_CLASS} flex-col-reverse sm:flex-row justify-center`}
        >
          <button
            type="button"
            onClick={onCancel}
            className={`${DIALOG_FOOTER_BTN} border border-border text-muted hover:text-text-primary hover:bg-hover-overlay`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className={`${DIALOG_FOOTER_BTN} border border-error-line bg-error-soft text-error hover:bg-error-hover`}
          >
            {discardLabel}
          </button>
          {showSave && onSave && (
            <button
              type="button"
              onClick={onSave}
              className={`${DIALOG_FOOTER_BTN} border border-accent bg-button-primary font-semibold text-white hover:bg-accent-hover`}
            >
              {saveLabel}
            </button>
          )}
        </div>
      }
    >
      <p className="text-sm text-text-primary leading-relaxed">{message}</p>
    </ModalShell>
  );
}
