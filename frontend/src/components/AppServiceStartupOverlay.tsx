import type { CSSProperties } from "react";
import { APP_DISPLAY_NAME, APP_LOGO_URL } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { ELEVATED_CARD_CLASS } from "../utils/styles";

interface AppServiceStartupOverlayProps {
  failed?: boolean;
  autoRecoveryExhausted?: boolean;
  retryBusy?: boolean;
  /** Full-screen gate (default) or inline card for welcome / workspace. */
  variant?: "overlay" | "inline";
}

function ExoBrandMark() {
  return (
    <div className="flex items-center justify-center gap-3">
      <img
        src={APP_LOGO_URL}
        alt=""
        width={56}
        height={56}
        className="h-14 w-14 shrink-0 object-contain pointer-events-none"
      />
      <p className="text-xl font-semibold tracking-tight text-text-primary">{APP_DISPLAY_NAME}</p>
    </div>
  );
}

/**
 * Full-screen gate while the packaged local Python service boots (PyInstaller cold start),
 * or recovery UI when automatic restart attempts are exhausted.
 */
export default function AppServiceStartupOverlay({
  failed = false,
  autoRecoveryExhausted = false,
  retryBusy = false,
  variant = "overlay",
}: AppServiceStartupOverlayProps) {
  const { t } = useI18n();
  const showFailure = failed && autoRecoveryExhausted && !retryBusy;
  const showRecovery = retryBusy || (failed && !autoRecoveryExhausted);

  const card = (
    <div
      className={`${ELEVATED_CARD_CLASS} w-full max-w-md px-6 py-8 text-center space-y-4`}
    >
      <ExoBrandMark />
      <div className="flex flex-col items-center gap-2">
        {!showFailure ? (
          <>
            <div
              className="relative h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border-soft"
              aria-hidden
            >
              <span className="absolute inset-y-0 w-[30%] animate-prepIndeterminate rounded-full bg-accent" />
            </div>
            {showRecovery ? (
              <p className="text-sm font-medium text-accent">{t("welcome.localServiceRetryBusy")}</p>
            ) : null}
          </>
        ) : (
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-lg font-bold text-amber-200"
            aria-hidden
          >
            !
          </span>
        )}
      </div>
      <div className="space-y-2">
        <h2 className="text-base font-semibold text-text-primary">
          {showFailure ? t("welcome.localServiceOfflineTitle") : t("welcome.localServiceStartingTitle")}
        </h2>
        <p className="text-sm text-muted leading-relaxed">
          {showFailure ? t("welcome.localServiceOfflineBody") : t("welcome.localServiceStartingBody")}
        </p>
      </div>
    </div>
  );

  if (variant === "inline") {
    return (
      <div role="status" aria-live="polite" aria-busy={!showFailure}>
        {card}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[48] flex items-center justify-center bg-bg-primary/95 backdrop-blur-sm p-4"
      role="status"
      aria-live="polite"
      aria-busy={!showFailure}
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      {card}
    </div>
  );
}
