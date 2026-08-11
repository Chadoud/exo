import { useI18n } from "../i18n/I18nContext";
import ModalShell from "./ModalShell";
import BillingSubscribeActions from "./BillingSubscribeActions";
import { MODAL_FOOTER_ROW_CLASS, OUTLINE_PILL_BTN_CLASS } from "../utils/styles";

interface TrialEndedGateModalProps {
  onEnterLicenseKey: () => void;
  /** Freemium: keep using the app with paid features paused (sorting, voice, sync). */
  onContinueLimited: () => void;
}

/**
 * Shown whenever the trial has ended. Exits are explicit only (no Esc/backdrop):
 * Subscribe, continue with limited access, or the license-key link.
 */
export default function TrialEndedGateModal({
  onEnterLicenseKey,
  onContinueLimited,
}: TrialEndedGateModalProps) {
  const { t } = useI18n();

  return (
    <ModalShell
      title={t("trial.gateTitle")}
      onClose={() => {
        /* Esc/backdrop/close-icon are inert — continuing must be an explicit choice. */
      }}
      dismissible={false}
      maxWidthClass="max-w-md"
      titleAlign="center"
      footer={
        <div className={`${MODAL_FOOTER_ROW_CLASS} flex-col gap-3`}>
          <BillingSubscribeActions />
          <button
            type="button"
            className={`${OUTLINE_PILL_BTN_CLASS} mt-1 min-h-10 w-full`}
            onClick={onContinueLimited}
          >
            {t("trial.continueLimited")}
          </button>
          <button
            type="button"
            onClick={onEnterLicenseKey}
            className="text-xs font-medium text-muted underline-offset-2 hover:text-text-primary hover:underline"
          >
            {t("trial.enterLicenseKeyInstead")}
          </button>
        </div>
      }
    >
      <p className="text-center text-sm leading-relaxed text-text-primary">{t("trial.gateBody")}</p>
    </ModalShell>
  );
}
