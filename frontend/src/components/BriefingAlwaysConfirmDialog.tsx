import ModalShell from "./ModalShell";
import { MODAL_FOOTER_ROW_CLASS } from "../utils/styles";
import { useI18n } from "../i18n/I18nContext";

const DIALOG_FOOTER_BTN =
  "inline-flex shrink-0 items-center justify-center min-h-[2.5rem] px-4 py-2 rounded-lg text-sm font-medium leading-snug transition-colors";

interface BriefingAlwaysConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirm “Always run today’s briefing on open” — ModalShell, same family as UnsavedChangesDialog.
 */
export default function BriefingAlwaysConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: BriefingAlwaysConfirmDialogProps) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <ModalShell
      title={t("briefingOffer.alwaysConfirmTitle")}
      onClose={onCancel}
      maxWidthClass="max-w-md"
      footer={
        <div
          className={`${MODAL_FOOTER_ROW_CLASS} flex-col-reverse sm:flex-row sm:flex-nowrap justify-center`}
        >
          <button
            type="button"
            onClick={onCancel}
            className={`${DIALOG_FOOTER_BTN} border border-border text-muted hover:text-text-primary hover:bg-hover-overlay`}
          >
            {t("briefingOffer.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`${DIALOG_FOOTER_BTN} border border-accent bg-button-primary font-semibold text-white hover:bg-accent-hover`}
          >
            {t("briefingOffer.alwaysConfirm")}
          </button>
        </div>
      }
    >
      <p className="text-sm text-text-primary leading-relaxed">{t("briefingOffer.alwaysConfirmBody")}</p>
    </ModalShell>
  );
}
