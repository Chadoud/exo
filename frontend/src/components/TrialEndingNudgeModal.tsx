import { useI18n } from "../i18n/I18nContext";
import ModalShell from "./ModalShell";
import BillingSubscribeActions from "./BillingSubscribeActions";
import { MODAL_FOOTER_ROW_CLASS, OUTLINE_PILL_BTN_CLASS } from "../utils/styles";

interface TrialEndingNudgeModalProps {
  trialDaysRemaining: number;
  onDismiss: () => void;
}

/** One-time nudge shown once ever when the trial has ≤3 days left. Fully dismissible. */
export default function TrialEndingNudgeModal({
  trialDaysRemaining,
  onDismiss,
}: TrialEndingNudgeModalProps) {
  const { t } = useI18n();

  const title =
    trialDaysRemaining <= 0
      ? t("trial.nudgeTitleToday")
      : trialDaysRemaining === 1
        ? t("trial.nudgeTitleOneDay")
        : t("trial.nudgeTitleDays", { days: trialDaysRemaining });

  return (
    <ModalShell
      title={title}
      onClose={onDismiss}
      maxWidthClass="max-w-md"
      titleAlign="center"
      footer={
        <div className={`${MODAL_FOOTER_ROW_CLASS} flex-col gap-3`}>
          <BillingSubscribeActions />
          <button
            type="button"
            className={`${OUTLINE_PILL_BTN_CLASS} mt-1 min-h-10 w-full`}
            onClick={onDismiss}
          >
            {t("trial.nudgeContinueFree")}
          </button>
        </div>
      }
    >
      <p className="text-center text-sm leading-relaxed text-text-primary">{t("trial.nudgeBody")}</p>
    </ModalShell>
  );
}