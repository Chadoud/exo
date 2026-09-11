import { useI18n } from "../../i18n/I18nContext";
import { Spinner } from "../Spinner";
import { OUTLINE_PILL_BTN_CLASS } from "../../utils/styles";

interface WelcomeLocalServiceCardProps {
  starting: boolean;
  onRetryBackend?: () => void | Promise<void>;
  onSkipSetup: () => void | Promise<void>;
  retryBusy?: boolean;
}

/**
 * Inline recovery when the local Python service is not ready during welcome model steps.
 * Replaces title-bar-only hints — the wizard covers the title bar.
 */
export default function WelcomeLocalServiceCard({
  starting,
  onRetryBackend,
  onSkipSetup,
  retryBusy = false,
}: WelcomeLocalServiceCardProps) {
  const { t } = useI18n();
  const canRetry = typeof onRetryBackend === "function";

  return (
    <div
      className="mb-4 rounded-xl border border-warning-line bg-warning-soft px-4 py-4 space-y-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {starting ? (
          <Spinner className="w-5 h-5 shrink-0 mt-0.5 text-warning" />
        ) : (
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning text-white text-xs font-bold">
            !
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-warning">
            {starting ? t("welcome.localServiceStartingTitle") : t("welcome.localServiceOfflineTitle")}
          </p>
          <p className="text-sm text-warning leading-relaxed">
            {starting ? t("welcome.localServiceStartingBody") : t("welcome.localServiceOfflineBody")}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        {canRetry && (
          <button
            type="button"
            disabled={retryBusy}
            onClick={() => void onRetryBackend!()}
            className={`${OUTLINE_PILL_BTN_CLASS} text-xs py-2 px-4 disabled:opacity-60`}
          >
            {retryBusy ? t("welcome.localServiceRetryBusy") : t("welcome.localServiceRetry")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSkipSetup()}
          className="text-xs font-medium text-warning underline underline-offset-2 hover:text-text-primary"
        >
          {t("welcome.localServiceSkipSetup")}
        </button>
      </div>
    </div>
  );
}
