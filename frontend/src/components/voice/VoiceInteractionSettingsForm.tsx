import type { AppSettings } from "../../types/settings";
import {
  defaultPushToTalkShortcut,
  type PushToTalkShortcut,
  type VoiceInteractionMode,
} from "../../types/voiceInteraction";
import { SECTION_LABEL_CLASS } from "../../utils/styles";
import { patchVoiceSettings, type VoiceSessionForSettingsSideEffects } from "../../utils/voiceSettingsSideEffects";
import { useI18n } from "../../i18n/I18nContext";
import type { VoiceBackendReadiness } from "../../hooks/useVoiceBackendReady";
import { deriveVoiceReadinessView } from "../../voice/voiceReadiness";
import { VoiceReadinessNotice } from "./VoiceReadinessNotice";

const MODE_OPTIONS: { id: VoiceInteractionMode; titleKey: string; hintKey: string }[] = [
  {
    id: "conversation",
    titleKey: "settings.voiceModeConversationTitle",
    hintKey: "settings.voiceModeConversationHint",
  },
  {
    id: "pushToTalk",
    titleKey: "settings.voiceModePttTitle",
    hintKey: "settings.voiceModePttHint",
  },
];

interface VoiceInteractionSettingsFormProps {
  settings: AppSettings;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  variant: "full" | "compact";
  /** Unique suffix so radio groups do not clash when popover + settings are both mounted. */
  radioGroupId?: string;
  voice?: VoiceSessionForSettingsSideEffects;
  onOpenAiProviderSettings?: () => void;
  /** When omitted (Settings page), readiness banners stay off this form. */
  voiceReadiness?: VoiceBackendReadiness;
}

/**
 * Shared voice interaction controls — used in Settings and the mic settings popover.
 */
export function VoiceInteractionSettingsForm({
  settings,
  onSettingsPatch,
  variant,
  radioGroupId = "default",
  voice,
  onOpenAiProviderSettings,
  voiceReadiness,
}: VoiceInteractionSettingsFormProps) {
  const { t } = useI18n();
  const isPtt = settings.voiceInteractionMode === "pushToTalk";
  const shortcut = settings.pttShortcut;
  const compact = variant === "compact";
  const supportsGlobalPtt = Boolean(window.electronAPI?.setPushToTalkConfig);
  const readinessView = voiceReadiness ? deriveVoiceReadinessView(voiceReadiness) : null;

  const applyPatch = (patch: Partial<AppSettings>) => {
    patchVoiceSettings(settings, patch, onSettingsPatch, voice);
  };

  const setShortcut = (patch: Partial<PushToTalkShortcut>) => {
    applyPatch({ pttShortcut: { ...shortcut, ...patch } });
  };

  const resetShortcut = () => {
    applyPatch({ pttShortcut: defaultPushToTalkShortcut() });
  };

  const modeCardClass = compact
    ? "flex cursor-pointer flex-col rounded-lg border border-border bg-bg-secondary/40 px-2.5 py-2 has-[:checked]:border-accent has-[:checked]:bg-accent/5 focus-within:ring-2 focus-within:ring-accent/50"
    : "flex cursor-pointer flex-col rounded-xl border border-border bg-bg-secondary/40 px-3 py-3 has-[:checked]:border-accent has-[:checked]:bg-accent/5 focus-within:ring-2 focus-within:ring-accent/50";

  const checkboxRowClass = compact
    ? "flex cursor-pointer items-start gap-2.5 py-1"
    : "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg-secondary/40 px-3 py-3 group";

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {readinessView ? (
        <VoiceReadinessNotice
          compact={compact}
          view={readinessView}
          onOpenSettings={onOpenAiProviderSettings}
          onRefresh={voiceReadiness?.refresh}
        />
      ) : null}

      <fieldset className="min-w-0">
        <legend className={`${SECTION_LABEL_CLASS} ${compact ? "mb-1.5" : "mb-2"}`}>
          {t("settings.voiceInteractionLegend")}
        </legend>
        <div className={`grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
          {MODE_OPTIONS.map((opt) => (
            <label key={opt.id} className={modeCardClass}>
              <span className="flex items-start gap-2">
                <input
                  type="radio"
                  name={`voice-interaction-mode-${radioGroupId}`}
                  className="mt-0.5 border-border text-accent focus:ring-accent"
                  checked={settings.voiceInteractionMode === opt.id}
                  onChange={() => applyPatch({ voiceInteractionMode: opt.id })}
                />
                <span>
                  <span className={`block font-medium text-text-primary ${compact ? "text-xs" : "text-sm"}`}>
                    {t(opt.titleKey)}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{t(opt.hintKey)}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className={checkboxRowClass}>
        <input
          type="checkbox"
          className="mt-0.5 rounded border-border text-accent focus:ring-accent"
          checked={settings.clapToLaunchEnabled}
          onChange={(e) => applyPatch({ clapToLaunchEnabled: e.target.checked })}
        />
        <span>
          <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.voiceControlClapToWakeLabel")}</span>
          <span className="mt-0.5 block text-xs leading-snug text-muted">
            {t("settings.voiceControlClapToWakeHint")}
          </span>
        </span>
      </label>

      {!isPtt ? (
        <label className={checkboxRowClass}>
          <input
            type="checkbox"
            className="mt-0.5 rounded border-border text-accent focus:ring-accent"
            checked={settings.voiceAutoStart}
            onChange={(e) => applyPatch({ voiceAutoStart: e.target.checked })}
          />
          <span>
            <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.voiceAutoStartLabel")}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">
              {t("settings.voiceAutoStartHint")}
            </span>
          </span>
        </label>
      ) : null}

      {isPtt ? (
        <div className={compact ? "space-y-2.5" : "space-y-4"}>
          <div>
            <p className={`${SECTION_LABEL_CLASS} mb-1`}>{t("settings.pttShortcutLabel")}</p>
            {!compact ? (
              <p className="mb-2 text-xs leading-snug text-muted">{t("settings.pttShortcutHint")}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-lg border border-border bg-bg-primary font-medium text-text-primary ${
                  compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
                }`}
              >
                {shortcut.displayLabel}
              </span>
              <button
                type="button"
                className="rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-text-primary hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                onClick={resetShortcut}
              >
                {t("settings.pttShortcutReset")}
              </button>
            </div>
          </div>

          <label className={checkboxRowClass}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-border text-accent focus:ring-accent"
              checked={settings.pttDoubleTapForLockedMode}
              onChange={(e) => applyPatch({ pttDoubleTapForLockedMode: e.target.checked })}
            />
            <span>
              <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.pttDoubleTapLabel")}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">
                {t("settings.pttDoubleTapHint")}
              </span>
            </span>
          </label>

          <label className={checkboxRowClass}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-border text-accent focus:ring-accent"
              checked={settings.pttShowOverlay}
              onChange={(e) => applyPatch({ pttShowOverlay: e.target.checked })}
            />
            <span>
              <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.pttOverlayLabel")}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">
                {t("settings.pttOverlayHint")}
              </span>
            </span>
          </label>

          <label className={checkboxRowClass}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-border text-accent focus:ring-accent"
              checked={settings.pttSoundsEnabled}
              onChange={(e) => applyPatch({ pttSoundsEnabled: e.target.checked })}
            />
            <span>
              <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.pttSoundsLabel")}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">
                {t("settings.pttSoundsHint")}
              </span>
            </span>
          </label>

          {supportsGlobalPtt ? (
            <label className={checkboxRowClass}>
              <input
                type="checkbox"
                className="mt-0.5 rounded border-border text-accent focus:ring-accent"
                checked={settings.pttGlobalWhenAppInBackground}
                onChange={(e) => applyPatch({ pttGlobalWhenAppInBackground: e.target.checked })}
              />
              <span>
                <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("settings.pttGlobalLabel")}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {t("settings.pttGlobalHint")}
                </span>
              </span>
            </label>
          ) : (
            <p className="text-xs leading-snug text-muted">{t("voice.micSettingsDesktopOnly")}</p>
          )}

          <label className={checkboxRowClass}>
            <input
              type="checkbox"
              className="rounded border-border text-accent focus:ring-accent"
              checked={shortcut.captureInApp}
              onChange={(e) => setShortcut({ captureInApp: e.target.checked })}
            />
            <span className={`text-text-primary ${compact ? "text-xs" : "text-sm"}`}>
              {t("settings.pttCaptureInAppLabel")}
            </span>
          </label>
        </div>
      ) : null}

      {import.meta.env.DEV ? (
        <div className={`border-t border-border ${compact ? "pt-3" : "pt-4"}`}>
          <label className={checkboxRowClass}>
            <input
              type="checkbox"
              className="mt-0.5 rounded border-border text-accent focus:ring-accent"
              checked={settings.assistantDebugUiEnabled}
              onChange={(e) => onSettingsPatch({ assistantDebugUiEnabled: e.target.checked })}
            />
            <span>
              <span className={`${SECTION_LABEL_CLASS} mb-0`}>{t("voice.assistantDebugUiLabel")}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">
                {t("voice.assistantDebugUiHint")}
              </span>
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
