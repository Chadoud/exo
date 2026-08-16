import ModalShell from "./ModalShell";
import {
  CONFIRM_DIALOG_DANGER_TONE_CLASS,
  CONFIRM_DIALOG_FOOTER_BTN_CLASS,
  CONFIRM_DIALOG_NEUTRAL_TONE_CLASS,
  CONFIRM_DIALOG_PRIMARY_TONE_CLASS,
  MODAL_FOOTER_ROW_CLASS,
} from "../utils/styles";

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone: "danger" | "primary";
  /** Overrides confirmLabel for aria-label when the visible label is ambiguous (e.g. multiple "Disconnect" buttons on one page). */
  confirmAriaLabel?: string;
}

/** Two-button confirm gate (Cancel + Confirm) shared by destructive/affirmative dialogs. */
export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onCancel,
  onConfirm,
  tone,
  confirmAriaLabel,
}: ConfirmDialogProps) {
  const toneClass = tone === "danger" ? CONFIRM_DIALOG_DANGER_TONE_CLASS : CONFIRM_DIALOG_PRIMARY_TONE_CLASS;
  return (
    <ModalShell
      title={title}
      onClose={onCancel}
      maxWidthClass="max-w-md"
      footer={
        <div className={`${MODAL_FOOTER_ROW_CLASS} flex-col-reverse sm:flex-row sm:flex-nowrap justify-end`}>
          <button
            type="button"
            onClick={onCancel}
            className={`${CONFIRM_DIALOG_FOOTER_BTN_CLASS} ${CONFIRM_DIALOG_NEUTRAL_TONE_CLASS}`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            className={`${CONFIRM_DIALOG_FOOTER_BTN_CLASS} ${toneClass}`}
            aria-label={confirmAriaLabel ?? confirmLabel}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-primary leading-relaxed">{body}</p>
    </ModalShell>
  );
}
