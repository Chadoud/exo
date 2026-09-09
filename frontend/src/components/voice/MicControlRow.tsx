import type { AppSettings } from "../../types/settings";
import type { UseVoiceSessionReturn } from "../../hooks/useVoiceSession";
import type { VoiceBackendReadiness } from "../../hooks/useVoiceBackendReady";
import { useI18n } from "../../i18n/I18nContext";
import { VoiceMicSettingsPopover } from "./VoiceMicSettingsPopover";
import { VoiceMicIssueBanner } from "./VoiceMicIssueBanner";
import { deriveVoiceReadinessView, showGearWarningBadge } from "../../voice/voiceReadiness";
import { isPushToTalkMode, isPttVoiceUiActive } from "../../utils/voiceInteractionUi";

const ICON_HIT = "min-h-11 min-w-11";

interface MicControlRowProps {
  voice: UseVoiceSessionReturn;
  voiceReadiness: VoiceBackendReadiness;
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  onOpenAiProviderSettings?: () => void;
  onOpenFullVoiceSettings?: () => void;
  layout: "exo" | "composer";
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
      />
    </svg>
  );
}

function composerMicButtonClass(isListening: boolean, blocked: boolean): string {
  const base = `rounded-xl border ${ICON_HIT} p-2.5 transition-colors focus:outline-none focus-visible:ring-2`;
  if (isListening) {
    return `${base} border-error bg-error-soft text-error hover:bg-error-strong focus-visible:ring-error/50`;
  }
  if (blocked) {
    return `${base} cursor-not-allowed border-border bg-bg-secondary text-muted opacity-50`;
  }
  return `${base} border-border bg-bg-secondary text-text-secondary hover:bg-hover-overlay focus-visible:ring-accent/50`;
}

function RestartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

/**
 * Mic toggle (conversation) or PTT hints, plus the mic settings gear on the same row.
 */
export function MicControlRow({
  voice,
  voiceReadiness,
  settings,
  onSettingsPatch,
  onOpenAiProviderSettings,
  onOpenFullVoiceSettings,
  layout,
}: MicControlRowProps) {
  const { t } = useI18n();
  const isPtt = isPushToTalkMode(settings);
  const pttUiActive = isPtt && isPttVoiceUiActive(voice);
  const isExoRail = layout === "exo";
  const view = deriveVoiceReadinessView(voiceReadiness);
  const canToggleOff = voice.isListening || voice.isReconnecting;
  const startBlocked = !view.canStart && !canToggleOff;
  const showRestart = Boolean(voice.error || voice.isReconnecting);
  const busy = view.busy || voice.isReconnecting;
  const gearWarning = showGearWarningBadge(voiceReadiness, { micEntryVisible: !isPtt });

  const settingsPopover = (
    <VoiceMicSettingsPopover
      settings={settings}
      onSettingsPatch={onSettingsPatch}
      voice={voice}
      voiceReadiness={voiceReadiness}
      showWarningBadge={gearWarning}
      onOpenAiProviderSettings={onOpenAiProviderSettings}
      onOpenFullVoiceSettings={onOpenFullVoiceSettings}
      placement="above"
      triggerVariant={isExoRail ? "rail" : "composer"}
    />
  );

  if (isPtt) {
    if (isExoRail) {
      return (
        <div className="flex items-center gap-1.5">
          {pttUiActive ? (
            <button
              type="button"
              onClick={() => {
                voice.stop();
                voice.dismissError();
              }}
              className="exo-action-btn min-w-0 flex-1"
            >
              {t("voice.pttEndSession")}
            </button>
          ) : (
            <p className="min-w-0 flex-1 px-0.5 text-center text-xs leading-snug text-muted">
              {t("voice.pttExoHint", { key: settings.pttShortcut.displayLabel })}
            </p>
          )}
          {settingsPopover}
        </div>
      );
    }

    return (
      <div className="flex min-w-0 flex-col items-stretch gap-1.5">
        <div className="flex shrink-0 items-center gap-1">
          {pttUiActive ? (
            <button
              type="button"
              onClick={() => {
                voice.stop();
                voice.dismissError();
              }}
              className={`rounded-xl border border-border bg-bg-secondary px-2.5 ${ICON_HIT} text-2xs font-medium text-text-primary transition-colors hover:bg-hover-overlay`}
            >
              {t("voice.pttEndSession")}
            </button>
          ) : null}
          {settingsPopover}
        </div>
        <VoiceMicIssueBanner
          voice={voice}
          onOpenAiProviderSettings={onOpenAiProviderSettings}
          onRetryVoice={() => {
            voice.stop();
            voice.dismissError();
            void voice.start();
          }}
        />
      </div>
    );
  }

  const micTitle = voice.isListening
    ? t("voice.micStopTitle")
    : view.messageKey
      ? t(view.messageKey)
      : t("voice.micStartTitle");

  const toggleMic = () => {
    if (canToggleOff) {
      voice.stop();
      voice.dismissError();
      return;
    }
    if (!view.canStart) return;
    void voice.start();
  };

  const retryVoice = () => {
    voice.stop();
    voice.dismissError();
    void voice.start();
  };

  const restartButton = (variant: "rail" | "composer") => (
    <button
      type="button"
      onClick={retryVoice}
      disabled={!view.canStart && !voice.isReconnecting}
      title={t("voice.micRestartTitle")}
      aria-label={t("voice.micRestartTitle")}
      className={
        variant === "rail"
          ? `exo-action-btn ${ICON_HIT} shrink-0 px-0 flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none`
          : `shrink-0 rounded-xl border border-border bg-bg-secondary ${ICON_HIT} p-2.5 text-text-secondary transition-colors hover:bg-hover-overlay hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 disabled:pointer-events-none`
      }
    >
      <RestartIcon className="h-4 w-4" />
    </button>
  );

  const issueBanner = (
    <VoiceMicIssueBanner
      voice={voice}
      onOpenAiProviderSettings={onOpenAiProviderSettings}
      onRetryVoice={retryVoice}
    />
  );

  if (isExoRail) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMic}
            disabled={startBlocked}
            aria-busy={busy}
            className={`exo-action-btn min-w-0 flex-1 disabled:pointer-events-none disabled:opacity-50 ${
              voice.isListening || voice.isReconnecting ? "exo-action-btn--active" : ""
            }`}
            title={t("voice.micShortcutTitle")}
          >
            {voice.isListening
              ? t("voice.micOnLabel")
              : voice.isReconnecting
                ? t("voice.micReconnectingLabel")
                : t("voice.micOffLabel")}
          </button>
          {showRestart ? restartButton("rail") : null}
          {settingsPopover}
        </div>
        {issueBanner}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1.5">
      <div className="flex shrink-0 items-center gap-1">
        <div className="relative">
          <button
            type="button"
            onClick={toggleMic}
            title={micTitle}
            aria-label={micTitle}
            aria-busy={busy}
            disabled={startBlocked}
            className={composerMicButtonClass(voice.isListening, startBlocked)}
          >
            <MicIcon className="h-4 w-4" />
          </button>
        </div>
        {showRestart ? restartButton("composer") : null}
        {settingsPopover}
      </div>
      {issueBanner}
    </div>
  );
}
