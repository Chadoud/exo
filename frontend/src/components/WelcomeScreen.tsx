import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { AppSettings } from "../types/settings";
import type { UseModelsReturn } from "../hooks/useModels";
import WelcomeSphereLayer from "./WelcomeSphereLayer";
import OutputFolderSection from "./settings/OutputFolderSection";
import SettingsModels from "./SettingsModels";
import WelcomePrivacyStep from "./WelcomePrivacyStep";
import UnsavedChangesDialog from "./UnsavedChangesDialog";
import WelcomeLocalServiceCard from "./welcome/WelcomeLocalServiceCard";
import WelcomeSignedInBanner from "./welcome/WelcomeSignedInBanner";
import { CARD_SHELL_CLASS, MODAL_SURFACE_CLASS, OUTLINE_PILL_BTN_CLASS, PRIMARY_BTN_CLASS } from "../utils/styles";
import { LEGAL_TERMS_BUNDLE_VERSION } from "../constants";
import { useI18n } from "../i18n/I18nContext";
import { isVisionCapableModelName } from "../utils/visionModels";
import GeminiApiKeySetupGuide from "./settings/GeminiApiKeySetupGuide";
import { commitWelcomeAiProviderStep } from "../utils/welcomeAiProviderStep";
import { track } from "../telemetry/client";
import { trackSetupMilestone } from "../telemetry/setupTelemetry";
import { TelemetryEventNames } from "../telemetry/schema";
import type { EntitlementStatus } from "../api";
import { useCloudSortActive } from "../hooks/useCloudSortActive";
import { accountDisplayLabel, accountFullName } from "../utils/accountProfileDisplay";

interface WelcomeScreenProps {
  settings: AppSettings;
  settingsHydrated: boolean;
  modelHook: UseModelsReturn;
  onSettingsPatch: (patch: Partial<AppSettings>) => void;
  onDismiss: () => void | Promise<void>;
  backendOnline: boolean;
  backendHealthProbing: boolean;
  backendServiceStarting?: boolean;
  onRetryBackend?: () => void | Promise<void>;
  onSwitchAccount?: () => void | Promise<void>;
  entitlement?: EntitlementStatus | null;
}

/** Steps 0..WELCOME_STEP_COUNT-1 — must match step content blocks and `stepLabels.length`. */
const WELCOME_STEP_COUNT = 3;

const WELCOME_STEP = {
  CONNECT_AI: 0,
  SORT_SETUP: 1,
  PRIVACY: 2,
} as const;

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div
      className="inline-flex flex-wrap items-center justify-center gap-1.5"
      aria-hidden
      title={`${current + 1} / ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            i <= current ? "bg-button-primary" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

export default function WelcomeScreen({
  settings,
  settingsHydrated,
  modelHook,
  onSettingsPatch,
  onDismiss,
  backendOnline,
  backendHealthProbing,
  backendServiceStarting = false,
  onRetryBackend,
  onSwitchAccount,
  entitlement,
}: WelcomeScreenProps) {
  const { t } = useI18n();
  const { cloudSortActive } = useCloudSortActive(entitlement);
  const signedInAccountLabel =
    entitlement?.cloudLoggedIn === true ? accountDisplayLabel(entitlement) : "";
  const signedInAccountEmail = entitlement?.cloudEmail?.trim() ?? "";
  const { refreshModels } = modelHook;
  const [retryBackendBusy, setRetryBackendBusy] = useState(false);
  const stepLabels = useMemo(
    () => [
      t("welcome.setupStepConnectAi"),
      cloudSortActive ? t("welcome.setupStepSortSetupCloud") : t("welcome.setupStepSortSetup"),
      t("welcome.setupStepPrivacy"),
    ],
    [t, cloudSortActive]
  );
  const [step, setStep] = useState(0);
  const [welcomeUnsavedOpen, setWelcomeUnsavedOpen] = useState(false);
  /** Shown only after WelcomeSphereLayer finishes solo-sphere dwell (see POST_WELCOME_SPHERE_MODAL_DELAY_MS). */
  const [setupShellVisible, setSetupShellVisible] = useState(false);
  const baselineRef = useRef<AppSettings | null>(null);
  const [welcomeModelSectionsCollapsed, setWelcomeModelSectionsCollapsed] = useState(
    () => new Set<string>()
  );

  const toggleWelcomeModelSection = useCallback((id: string) => {
    setWelcomeModelSectionsCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onSphereBackdropReady = useCallback(() => {
    setSetupShellVisible(true);
  }, []);

  useEffect(() => {
    if (!settingsHydrated) return;
    if (baselineRef.current === null) {
      baselineRef.current = structuredClone(settings);
    }
  }, [settingsHydrated, settings]);

  useEffect(() => {
    if (!settingsHydrated) return;
    track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.welcomeStepViewed, {
      step,
    });
  }, [step, settingsHydrated, settings.telemetryOptIn, settings.uiLocale]);

  useEffect(() => {
    if (step !== WELCOME_STEP.SORT_SETUP || cloudSortActive) return;
    void refreshModels({ silent: true });
  }, [step, refreshModels, cloudSortActive]);

  useEffect(() => {
    if (!cloudSortActive || settings.model.trim()) return;
    onSettingsPatch({ model: "mistral" });
  }, [cloudSortActive, settings.model, onSettingsPatch]);

  const handleRetryLocalService = useCallback(async () => {
    if (typeof onRetryBackend !== "function" || retryBackendBusy) return;
    setRetryBackendBusy(true);
    try {
      await onRetryBackend();
    } finally {
      setRetryBackendBusy(false);
    }
  }, [onRetryBackend, retryBackendBusy]);

  const isSortModelStep = step === WELCOME_STEP.SORT_SETUP;
  const localServicePending = isSortModelStep && (backendHealthProbing || !backendOnline);
  const localServiceStarting = localServicePending && (backendHealthProbing || backendServiceStarting);

  const renderLocalServiceCard = () =>
    localServicePending ? (
      <WelcomeLocalServiceCard
        starting={localServiceStarting}
        onRetryBackend={onRetryBackend ? handleRetryLocalService : undefined}
        onSkipSetup={handleSkipSetup}
        retryBusy={retryBackendBusy}
      />
    ) : null;

  const installedTextModels = useMemo(
    () => modelHook.models.filter((m) => !isVisionCapableModelName(m)),
    [modelHook.models]
  );

  /** Model chat step: if a text model is already on disk but none is chosen, pick one so Next is not blocked. */
  useEffect(() => {
    if (step !== WELCOME_STEP.SORT_SETUP || !settingsHydrated) return;
    if (modelHook.loadingModels || modelHook.installingModel) return;
    if (settings.model.trim()) return;
    if (installedTextModels.length === 0) return;
    const sorted = [...installedTextModels].sort((a, b) => a.localeCompare(b));
    const pick = sorted[0];
    onSettingsPatch({ model: pick });
    if (baselineRef.current) {
      baselineRef.current = { ...baselineRef.current, model: pick };
    }
  }, [
    step,
    settingsHydrated,
    modelHook.loadingModels,
    modelHook.installingModel,
    settings.model,
    installedTextModels,
    onSettingsPatch,
  ]);

  const isDirty =
    baselineRef.current !== null &&
    JSON.stringify(settings) !== JSON.stringify(baselineRef.current);

  const requestDismiss = useCallback(() => {
    if (isDirty) setWelcomeUnsavedOpen(true);
    else {
      track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.welcomeDismissed, {});
      void onDismiss();
    }
  }, [isDirty, onDismiss, settings.telemetryOptIn, settings.uiLocale]);

  const handleSkipSetup = useCallback(async () => {
    if (isDirty) {
      requestDismiss();
      return;
    }
    track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.welcomeDismissed, {});
    await onDismiss();
  }, [isDirty, onDismiss, requestDismiss, settings.telemetryOptIn, settings.uiLocale]);

  /** Model steps: defer when service is offline; wait while cold-start probe runs unless user continues anyway. */
  const canGoNext = useMemo(() => {
    if (modelHook.installingModel) return false;
    if (step === WELCOME_STEP.SORT_SETUP) {
      if (backendHealthProbing) return false;
      return true;
    }
    if (step === WELCOME_STEP.PRIVACY) {
      return settings.acceptedLegalTermsVersion === LEGAL_TERMS_BUNDLE_VERSION;
    }
    return true;
  }, [
    step,
    modelHook.installingModel,
    backendHealthProbing,
    settings.acceptedLegalTermsVersion,
  ]);

  const handleNext = useCallback(async () => {
    if (step === WELCOME_STEP.SORT_SETUP && !settings.outputDir.trim()) {
      try {
        const dir = await window.electronAPI?.getDefaultOutputDir?.();
        if (dir) onSettingsPatch({ outputDir: dir });
      } catch {
        /* ignore */
      }
    }
    if (step === WELCOME_STEP.CONNECT_AI) {
      await commitWelcomeAiProviderStep(settings, onSettingsPatch);
    }
    if (step < WELCOME_STEP_COUNT - 1) {
      setStep((s) => s + 1);
    } else {
      // Finishing the wizard commits the path the user chose — do not treat as “leave with unsaved changes”
      // (isDirty would almost always be true vs. the first-hydration baseline after earlier steps).
      track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.welcomeCompleted, {});
      trackSetupMilestone(settings.telemetryOptIn, settings.uiLocale, "welcome_completed");
      void onDismiss();
    }
  }, [
    step,
    settings.outputDir,
    settings.telemetryOptIn,
    settings.uiLocale,
    settings,
    onSettingsPatch,
    onDismiss,
  ]);

  const showContinueAnyway =
    isSortModelStep && !canGoNext && !modelHook.installingModel && backendHealthProbing;

  const handleUseLocalAiOnly = useCallback(async () => {
    const localOnlySettings = { ...settings, geminiApiKey: "" };
    onSettingsPatch({ geminiApiKey: "", aiProvider: "ollama" });
    await commitWelcomeAiProviderStep(localOnlySettings, onSettingsPatch);
    setStep(WELCOME_STEP.SORT_SETUP);
  }, [settings, onSettingsPatch]);

  useEffect(() => {
    if (!setupShellVisible) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inTextField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (inTextField) return;

      if (e.key === "ArrowLeft") {
        if (step <= 0) return;
        e.preventDefault();
        setStep((s) => s - 1);
        return;
      }

      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (!canGoNext) return;
        e.preventDefault();
        void handleNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setupShellVisible, step, canGoNext, handleNext]);


  return (
    <>
      <div className="welcome-sphere-hero-host fixed inset-0 z-40 overflow-hidden">
        <WelcomeSphereLayer onBackdropReady={onSphereBackdropReady} />
      </div>
      {setupShellVisible ? (
      <div className="welcome-setup-shell-overlay fixed inset-0 z-50 flex flex-col items-center justify-center bg-welcome-overlay backdrop-blur-[6px] p-4 gap-4 min-h-0">
        <div
            className={`${MODAL_SURFACE_CLASS} relative max-h-[min(96dvh,56rem)] w-full min-h-0 max-w-3xl`}
          >

        {/* Scrollable body keeps footer (Back / Next) in view when Download Models is expanded */}
        <div className="flex min-h-0 flex-1 flex-col">
        {/* Title + dots — fixed height band */}
        <div className="shrink-0 space-y-6 px-5 pt-6 sm:px-8 sm:pt-8">
          <div className="text-center space-y-3">
            <div className="inline-flex w-14 h-14 rounded-xl bg-bg-secondary items-center justify-center mx-auto">
              {step === WELCOME_STEP.SORT_SETUP && (
                <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v.75A2.25 2.25 0 0 1 19.5 17.25h-15a2.25 2.25 0 0 1-2.25-2.25V13.5" />
                </svg>
              )}
              {step === WELCOME_STEP.CONNECT_AI && (
                <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
                </svg>
              )}
              {step === WELCOME_STEP.PRIVACY && (
                <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
                <p className="shrink-0 text-left text-3xs font-semibold uppercase tracking-widest text-muted">
                  {t("welcome.stepCounter", {
                    current: String(step + 1),
                    total: String(stepLabels.length),
                    label: stepLabels[step] ?? "",
                  })}
                </p>
                <ProgressDots current={step} total={stepLabels.length} />
              </div>
              <h1 className="text-xl font-bold text-text-primary mt-1">
                {step === WELCOME_STEP.CONNECT_AI && t("welcome.aiProviderHeading")}
                {step === WELCOME_STEP.SORT_SETUP && t("welcome.sortSetupHeading")}
                {step === WELCOME_STEP.PRIVACY && t("welcome.privacyStepHeading")}
              </h1>
              <p
                className={`text-sm text-muted mt-1 mx-auto ${
                  step === WELCOME_STEP.SORT_SETUP ? "max-w-2xl" : "max-w-sm"
                }`}
              >
                {step === WELCOME_STEP.CONNECT_AI && t("welcome.aiProviderSubtitle")}
                {step === WELCOME_STEP.SORT_SETUP &&
                  (cloudSortActive ? t("welcome.sortSetupSubtitleCloud") : t("welcome.sortSetupSubtitle"))}
                {step === WELCOME_STEP.PRIVACY && t("welcome.privacyStepSubtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Step content — scrolls; does not push footer off-screen */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-6 pt-2 sm:px-8">
          {step === WELCOME_STEP.CONNECT_AI && (
            <div className="space-y-6 py-2 max-w-xl mx-auto">
              {signedInAccountLabel ? (
                <WelcomeSignedInBanner
                  displayLabel={signedInAccountLabel}
                  email={signedInAccountEmail}
                  showEmail={Boolean(accountFullName(entitlement))}
                  onSwitchAccount={onSwitchAccount}
                />
              ) : null}
              <div className={`relative ${CARD_SHELL_CLASS} border-l-2 border-l-accent p-5 space-y-3`}>
                <span className="absolute right-4 top-4 rounded-full bg-button-primary px-2 py-0.5 text-2xs font-semibold text-white">
                  {t("welcome.providerSelectedBadge")}
                </span>
                <div className="flex items-center gap-2 pr-16">
                  <span className="text-2xl">✦</span>
                  <div>
                    <div className="font-bold text-text-primary">{t("welcome.geminiCardTitle")}</div>
                    <div className="text-2xs text-muted">{t("welcome.geminiCardSubline")}</div>
                  </div>
                </div>
                <ul className="flex flex-row flex-nowrap items-center gap-x-3 sm:gap-x-5 overflow-x-auto text-2xs sm:text-xs text-muted list-none m-0 p-0">
                  <li className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                    <span className="text-success" aria-hidden>✓</span>
                    {t("welcome.geminiBulletFast")}
                  </li>
                  <li className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                    <span className="text-success" aria-hidden>✓</span>
                    {t("welcome.geminiBulletVoice")}
                  </li>
                  <li className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                    <span className="text-success" aria-hidden>✓</span>
                    {t("welcome.geminiBulletFreeTier")}
                  </li>
                </ul>
              </div>

              <div className="border-t border-border pt-4 sm:pt-5">
                <GeminiApiKeySetupGuide
                  inputId="welcome-gemini-api-key"
                  apiKey={settings.geminiApiKey}
                  onApiKeyChange={(key) => onSettingsPatch({ geminiApiKey: key })}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleUseLocalAiOnly()}
                  className={`${OUTLINE_PILL_BTN_CLASS} w-full justify-center sm:flex-1`}
                >
                  {t("welcome.useLocalAiOnly")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleNext()}
                  className={`${PRIMARY_BTN_CLASS} w-full justify-center sm:flex-1`}
                >
                  {t("welcome.ctaNextWithGemini")}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {step === WELCOME_STEP.SORT_SETUP && (
            <div className="space-y-6 py-2">
              <OutputFolderSection local={settings} update={onSettingsPatch} />
              {renderLocalServiceCard()}
              {!cloudSortActive ? (
                <SettingsModels
                  settings={settings}
                  modelHook={modelHook}
                  onSettingsPatch={onSettingsPatch}
                  collapsed={welcomeModelSectionsCollapsed}
                  onToggleSection={toggleWelcomeModelSection}
                  showActiveModel={false}
                  sections={["download"]}
                  downloadScope="sortOnly"
                  storageQueriesEnabled={backendOnline}
                  entitlement={entitlement}
                />
              ) : null}
              <p className="text-xs text-muted leading-relaxed">
                {cloudSortActive ? t("welcome.sortSetupVisionHintCloud") : t("welcome.sortSetupVisionHint")}
              </p>
            </div>
          )}

          {step === WELCOME_STEP.PRIVACY && (
            <WelcomePrivacyStep settings={settings} onSettingsPatch={onSettingsPatch} />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-border flex items-center justify-between gap-3 bg-bg-secondary sm:px-8 sm:py-5">
          <button
            type="button"
            onClick={() => void handleSkipSetup()}
            disabled={
              step === WELCOME_STEP.PRIVACY &&
              settings.acceptedLegalTermsVersion !== LEGAL_TERMS_BUNDLE_VERSION
            }
            title={
              step === WELCOME_STEP.PRIVACY &&
              settings.acceptedLegalTermsVersion !== LEGAL_TERMS_BUNDLE_VERSION
                ? t("welcome.skipBlockedUntilLegalAccept")
                : undefined
            }
            className="text-xs text-muted hover:text-text-primary transition-colors underline underline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
          >
            {t("welcome.skipSetup")}
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className={OUTLINE_PILL_BTN_CLASS}
              >
                {t("welcome.backButton")}
              </button>
            )}
            {showContinueAnyway && (
              <button
                type="button"
                onClick={() => void handleNext()}
                className={OUTLINE_PILL_BTN_CLASS}
              >
                {t("welcome.continueAnyway")}
              </button>
            )}
            {step !== WELCOME_STEP.CONNECT_AI && (
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={!canGoNext}
              className={PRIMARY_BTN_CLASS}
            >
              {step === WELCOME_STEP_COUNT - 1 ? (
                <>
                  {t("welcome.ctaStart")}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </>
              ) : (
                <>
                  {t("welcome.ctaNext")}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
            )}
          </div>
        </div>
        </div>
        </div>

        <UnsavedChangesDialog
          open={welcomeUnsavedOpen}
          title={t("welcome.leaveTitle")}
          message={t("welcome.leaveMessage")}
          cancelLabel={t("welcome.leaveKeepEditing")}
          discardLabel={t("welcome.leaveDiscard")}
          saveLabel={t("welcome.leaveSave")}
          onCancel={() => setWelcomeUnsavedOpen(false)}
          onDiscard={() => {
            if (baselineRef.current) {
              onSettingsPatch(baselineRef.current);
            }
            setWelcomeUnsavedOpen(false);
            track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.welcomeDismissed, {});
            void onDismiss();
          }}
          onSave={() => {
            setWelcomeUnsavedOpen(false);
            track(settings.telemetryOptIn, settings.uiLocale, TelemetryEventNames.welcomeDismissed, {});
            void onDismiss();
          }}
        />
      </div>
      ) : null}
    </>
  );
}
