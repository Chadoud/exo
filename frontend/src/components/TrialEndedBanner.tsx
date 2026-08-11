import { useI18n } from "../i18n/I18nContext";

interface TrialEndedBannerProps {
  /** Reopens the trial-ended gate (with its plan cards). */
  onSeePlans: () => void;
}

/**
 * Persistent strip shown at the top of the main workspace column while the app
 * runs in limited mode (trial over, no subscription/license). In normal flow —
 * it spans the main container's full width and pushes content down. Not
 * dismissible: it is the upgrade path.
 */
export default function TrialEndedBanner({ onSeePlans }: TrialEndedBannerProps) {
  const { t } = useI18n();

  return (
    <div
      role="status"
      className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-bg-secondary px-4 py-1.5"
    >
      <p className="text-xs text-muted">{t("trial.limitedBanner")}</p>
      <button
        type="button"
        onClick={onSeePlans}
        className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
      >
        {t("trial.limitedSeePlans")}
      </button>
    </div>
  );
}
