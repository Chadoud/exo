import { useCallback, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import ModalShell from "./ModalShell";
import BillingSubscribeActions from "./BillingSubscribeActions";
import { MODAL_FOOTER_ROW_CLASS, OUTLINE_PILL_BTN_CLASS } from "../utils/styles";

const QUIT_TIMEOUT_MS = 5000;

type QuitState = "idle" | "quitting" | "timedOut";

/** Owns the "Quitting…" busy state and the fallback if `app:quit` never resolves. */
function useQuitWithTimeout() {
  const [state, setState] = useState<QuitState>("idle");
  const timeoutRef = useRef<number | null>(null);
  // A ref, not `state`, guards re-entry: `state` only updates on the next render, so a second
  // click fired before that render (same React batch) would still see "idle" and re-invoke.
  const quittingRef = useRef(false);

  const quit = useCallback(async () => {
    if (quittingRef.current) return;
    quittingRef.current = true;
    const bridge = window.electronAPI?.quitApp;
    if (!bridge) {
      quittingRef.current = false;
      setState("timedOut");
      return;
    }
    setState("quitting");
    timeoutRef.current = window.setTimeout(() => {
      quittingRef.current = false;
      setState("timedOut");
    }, QUIT_TIMEOUT_MS);
    try {
      await bridge();
      // On success the app process exits; nothing left to render.
    } catch {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      quittingRef.current = false;
      setState("timedOut");
    }
  }, []);

  return { state, quit };
}

interface TrialEndedGateModalProps {
  onEnterLicenseKey: () => void;
}

/** Non-dismissible gate shown whenever the trial has ended. Only exits are Subscribe, Quit, or the license-key link. */
export default function TrialEndedGateModal({ onEnterLicenseKey }: TrialEndedGateModalProps) {
  const { t } = useI18n();
  const { state: quitState, quit } = useQuitWithTimeout();
  const canQuit = typeof window.electronAPI?.quitApp === "function";

  return (
    <ModalShell
      title={t("trial.gateTitle")}
      onClose={() => {
        /* Non-dismissible: no Esc/backdrop/close-icon route reaches this. */
      }}
      dismissible={false}
      maxWidthClass="max-w-md"
    >
      <p className="text-center text-sm leading-relaxed text-text-primary">{t("trial.gateBody")}</p>
      <div
        className={`${MODAL_FOOTER_ROW_CLASS} flex-col gap-3 -mx-6 -mb-5 mt-5 border-t border-border pt-4`}
      >
        <BillingSubscribeActions />
        {canQuit && (
          <button
            type="button"
            className={`${OUTLINE_PILL_BTN_CLASS} min-h-10 w-full`}
            disabled={quitState === "quitting"}
            onClick={() => void quit()}
          >
            {quitState === "quitting" ? t("trial.quitting") : t("trial.quit")}
          </button>
        )}
        {quitState === "timedOut" && canQuit && (
          <p className="text-center text-xs text-warning" role="status">
            {t("trial.quitTimedOut")}
          </p>
        )}
        <button
          type="button"
          onClick={onEnterLicenseKey}
          className="text-xs font-medium text-muted underline-offset-2 hover:text-text-primary hover:underline"
        >
          {t("trial.enterLicenseKeyInstead")}
        </button>
      </div>
    </ModalShell>
  );
}
