import { useEffect, useRef } from "react";
import type { BriefingOfferPhase } from "../voice/briefingOfferTypes";
import { useI18n } from "../i18n/I18nContext";
import BriefingAlwaysConfirmDialog from "./BriefingAlwaysConfirmDialog";

export interface BriefingOfferChromeProps {
  phase: BriefingOfferPhase;
  errorMessage: string | null;
  confirmAlwaysOpen: boolean;
  onAccept: () => void;
  onSkipSession: () => void;
  onNever: () => void;
  onOpenAlwaysConfirm: () => void;
  onConfirmAlways: () => void;
  onCancelAlwaysConfirm: () => void;
  onCancel: () => void;
  onRetry: () => void;
  /** Compact strip for AmbientVoiceHud vs ExoCenter status stack. */
  variant?: "exo" | "hud";
}

const PRIMARY_BTN =
  "inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-2xs font-medium transition-colors";

/**
 * Presentational BriefingOffer chrome — Offering / Loading / Error.
 * Running uses existing briefing section crumbs + toolPhaseLabel.
 */
export default function BriefingOfferChrome({
  phase,
  errorMessage,
  confirmAlwaysOpen,
  onAccept,
  onSkipSession,
  onNever,
  onOpenAlwaysConfirm,
  onConfirmAlways,
  onCancelAlwaysConfirm,
  onCancel,
  onRetry,
  variant = "exo",
}: BriefingOfferChromeProps) {
  const { t } = useI18n();
  const yesRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase === "offering") {
      yesRef.current?.focus();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "offering") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmAlwaysOpen) {
        e.preventDefault();
        onSkipSession();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, confirmAlwaysOpen, onSkipSession]);

  if (phase === "idle") return null;

  const stackClass =
    variant === "hud"
      ? "pointer-events-auto flex w-full flex-col gap-1.5 px-1 py-1"
      : "pointer-events-auto mt-1.5 flex w-full max-w-[min(100%,28rem)] flex-col items-center gap-1.5 px-2";

  return (
    <>
      <div
        role="region"
        aria-label={t("briefingOffer.regionLabel")}
        className={stackClass}
      >
        {phase === "offering" ? (
          <>
            <p
              className={
                variant === "hud"
                  ? "text-xs font-medium text-text-primary"
                  : "text-xs font-medium text-white/90"
              }
            >
              {t("briefingOffer.title")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                ref={yesRef}
                type="button"
                onClick={onAccept}
                className={`${PRIMARY_BTN} border border-accent bg-button-primary text-white hover:bg-accent-hover`}
              >
                {t("briefingOffer.yes")}
              </button>
              <button
                type="button"
                onClick={onSkipSession}
                className={`${PRIMARY_BTN} border border-border bg-bg-card/80 text-text-primary hover:bg-hover-overlay`}
              >
                {t("briefingOffer.notNow")}
              </button>
              <button
                type="button"
                onClick={onNever}
                className={`${PRIMARY_BTN} border border-border/80 text-muted hover:text-text-primary hover:bg-hover-overlay`}
              >
                {t("briefingOffer.never")}
              </button>
            </div>
            <button
              type="button"
              onClick={onOpenAlwaysConfirm}
              className={
                variant === "hud"
                  ? "text-3xs text-accent underline-offset-2 hover:underline"
                  : "text-3xs text-white/55 underline-offset-2 hover:text-white/85 hover:underline"
              }
            >
              {t("briefingOffer.always")}
            </button>
          </>
        ) : null}

        {phase === "loading" ? (
          <div className="flex flex-col items-center gap-1.5" aria-live="polite">
            <div className="flex items-center gap-2">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-accent/30 border-t-accent animate-spin"
                aria-hidden
              />
              <p
                className={
                  variant === "hud"
                    ? "text-xs text-text-secondary"
                    : "text-xs text-white/80"
                }
              >
                {t("briefingOffer.loading")}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className={`${PRIMARY_BTN} border border-border text-muted hover:text-text-primary hover:bg-hover-overlay`}
            >
              {t("briefingOffer.cancel")}
            </button>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="flex flex-col items-center gap-1.5" aria-live="polite">
            <p
              className={
                variant === "hud"
                  ? "text-xs text-red-200/95"
                  : "text-xs text-red-200/95"
              }
            >
              {errorMessage || t("briefingOffer.error")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={onRetry}
                className={`${PRIMARY_BTN} border border-accent bg-button-primary text-white hover:bg-accent-hover`}
              >
                {t("briefingOffer.retry")}
              </button>
              <button
                type="button"
                onClick={onSkipSession}
                className={`${PRIMARY_BTN} border border-border text-muted hover:text-text-primary hover:bg-hover-overlay`}
              >
                {t("briefingOffer.notNow")}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <BriefingAlwaysConfirmDialog
        open={confirmAlwaysOpen}
        onConfirm={onConfirmAlways}
        onCancel={onCancelAlwaysConfirm}
      />
    </>
  );
}
