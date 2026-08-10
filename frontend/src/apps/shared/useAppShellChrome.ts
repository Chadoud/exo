import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  TOUR_COMPLETED_STORAGE_KEY,
  BACKEND_PORT,
  CLAP_WAKE_VOICE_EVENT,
  SIDEBAR_PERSONA_STORAGE_KEY,
  VOICE_MIC_ACTIVE_EVENT,
} from "../../constants";
import { useBackendHealth } from "../../hooks/useBackendHealth";
import { useBackendAutoRecovery } from "../../hooks/useBackendAutoRecovery";
import { useCommandPaletteCommands } from "../../hooks/useCommandPaletteCommands";
import { useCommandPaletteShortcuts } from "../../hooks/useCommandPaletteShortcuts";
import { useDoubleClapWake } from "../../hooks/useDoubleClapWake";
import { useTheme } from "../../hooks/useTheme";
import { useWelcomeFlow } from "../../hooks/useWelcomeFlow";
import { useTourFirstRunAutoOpen } from "../../hooks/useTourFirstRunAutoOpen";
import { useCloudSortActive } from "../../hooks/useCloudSortActive";
import { useCloudSortConnectionStatus } from "../../hooks/useCloudSortConnectionStatus";
import {
  buildProductTourStepMeta,
  productTourHighlightId,
} from "../../i18n/productTourSteps";
import { useMainNavItems, orderNavItemsByPersona, type MainNavTab } from "../../hooks/useMainNavItems";
import { useTodoFeed } from "../../hooks/useTodoFeed";
import { useEntitlement } from "../../hooks/useEntitlement";
import { useSettingsTabGuard } from "../../hooks/useSettingsTabGuard";
import { useSettingsNavigation } from "../../hooks/useSettingsNavigation";
import { useOutputFolderSortTabToast } from "../../hooks/useOutputFolderSortTabToast";
import { useAppTelemetry } from "../../hooks/useAppTelemetry";
import { useTelemetryHeartbeat } from "../../telemetry/heartbeat";
import { trackAccountSignedOut } from "../../telemetry/lifecycle";
import { useSystemCommandDelegate } from "../../hooks/useSystemCommandDelegate";
import { useModels } from "../../hooks/useModels";
import type { UseModelsReturn } from "../../hooks/useModels";
import type { UiLocale } from "../../i18n/locale";
import type { AppSettings } from "../../types/settings";
import { isFirstRunProductTourPending, shouldDeferProductTourAutoOpen } from "../../utils/productTourGate";
import { hasEntitlementIpc } from "../../utils/electronDesktop";
import { translate } from "../../i18n/translate";
import { setProductDebugAccessCached } from "../../utils/productDebugAccess";
import { buildGeminiChatSettingsPatch } from "../../utils/geminiChatSetup";
import { resolveSortModelDisplayName } from "../../utils/sortChatInstalledModels";
import { applyTodoNavBadges } from "../../utils/todoNavBadges";
import type { FileEntry } from "../../api";

type Tab = MainNavTab;

export function useAppShellChrome(opts: {
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  hydrated: boolean;
  uiLocale: UiLocale;
  tab: Tab;
  setTab: Dispatch<SetStateAction<Tab>>;
  refreshTree: () => Promise<void>;
  reassignFile: FileEntry | null;
}) {
  const {
    settings,
    setSettings,
    hydrated,
    uiLocale,
    tab,
    setTab,
    refreshTree,
    reassignFile,
  } = opts;

  const { backendOnline, lastHealthOkAt, backendHealthProbing, backendServiceStarting, backendStartupFailed, beginBackendStartupProbe } =
    useBackendHealth();
  const { theme, toggleTheme } = useTheme();
  const {
    entitlement,
    entitlementLoaded,
    refreshEntitlement,
    refreshEntitlementWithStatus,
    needsCloudAccount,
    mainAppReady: entitlementMainAppReady,
  } = useEntitlement(uiLocale);

  useEffect(() => {
    setProductDebugAccessCached(Boolean(entitlement?.isProductAdmin));
  }, [entitlement?.isProductAdmin, entitlement?.cloudLoggedIn]);

  const { cloudSortActive } = useCloudSortActive(entitlement);
  useCloudSortConnectionStatus({
    enabled: cloudSortActive,
    backendOnline,
    entitlement,
  });

  const handleDoubleClapWake = useCallback(() => {
    void window.electronAPI?.restoreAndFocusWindow?.();
    setTab("exo");
    window.dispatchEvent(new CustomEvent(CLAP_WAKE_VOICE_EVENT));
  }, [setTab]);

  const [voiceMicActive, setVoiceMicActive] = useState(false);
  useEffect(() => {
    const onVoiceMicActive = (event: Event) => {
      const active = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
      setVoiceMicActive(active);
    };
    window.addEventListener(VOICE_MIC_ACTIVE_EVENT, onVoiceMicActive);
    return () => window.removeEventListener(VOICE_MIC_ACTIVE_EVENT, onVoiceMicActive);
  }, []);

  useDoubleClapWake({
    enabled: settings.clapToLaunchEnabled && !voiceMicActive,
    onDoubleClap: handleDoubleClapWake,
  });

  useEffect(() => {
    if (!hydrated) return;
    void window.electronAPI?.setClapEnabled?.(settings.clapToLaunchEnabled);
  }, [hydrated, settings.clapToLaunchEnabled]);

  /** Unthrottle Chromium only while clap-wake is actively sampling the mic. */
  useEffect(() => {
    const clapListening = settings.clapToLaunchEnabled && !voiceMicActive;
    void window.electronAPI?.setBackgroundThrottling?.(!clapListening);
  }, [settings.clapToLaunchEnabled, voiceMicActive]);

  const welcome = useWelcomeFlow({
    hydrated,
    entitlementLoaded,
    needsCloudAccount,
    settings,
    setSettings,
    setTab,
    entitlement,
  });

  const modelHook: UseModelsReturn = useModels({
    backendOnline,
    suppressErrorsWhileProbing: backendHealthProbing,
    suppressErrorToasts: welcome.showWelcome,
    entitlement,
  });

  const handleSwitchAccount = useCallback(async () => {
    if (typeof window.electronAPI?.cloudAuthLogout !== "function") return;
    trackAccountSignedOut(settings.telemetryOptIn, settings.uiLocale);
    await window.electronAPI.cloudAuthLogout();
    await refreshEntitlement();
  }, [refreshEntitlement, settings.telemetryOptIn, settings.uiLocale]);

  const [modelDownloadModalRole, setModelDownloadModalRole] = useState<null | "sort" | "vision">(null);
  const [geminiSetupModalOpen, setGeminiSetupModalOpen] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    const patch = buildGeminiChatSettingsPatch(settings);
    if (!patch) return;
    setSettings((current) => ({ ...current, ...patch }));
  }, [
    hydrated,
    settings.geminiApiKey,
    settings.chatProviders?.gemini?.apiKey,
    settings.chatModel,
    settings.aiProvider,
    setSettings,
  ]);

  useEffect(() => {
    const onOpenGeminiSetup = () => setGeminiSetupModalOpen(true);
    window.addEventListener("exosites-open-gemini-setup", onOpenGeminiSetup);
    return () => window.removeEventListener("exosites-open-gemini-setup", onOpenGeminiSetup);
  }, []);

  useEffect(() => {
    if (!hydrated || modelHook.loadingModels) return;
    if (settings.model.trim()) return;
    const pick = resolveSortModelDisplayName(modelHook.models, "");
    if (!pick) return;
    setSettings((current) => (current.model.trim() ? current : { ...current, model: pick }));
  }, [hydrated, modelHook.loadingModels, modelHook.models, settings.model, setSettings]);

  useEffect(() => {
    const onOpenDownload = (ev: Event) => {
      if (cloudSortActive) return;
      const ce = ev as CustomEvent<{ role?: "sort" | "vision" }>;
      setModelDownloadModalRole(ce.detail?.role === "vision" ? "vision" : "sort");
    };
    window.addEventListener("exosites-open-model-download", onOpenDownload);
    return () => window.removeEventListener("exosites-open-model-download", onOpenDownload);
  }, [cloudSortActive]);

  const openModelDownloadModal = useCallback(
    (role: "sort" | "vision") => {
      if (cloudSortActive) return;
      setModelDownloadModalRole(role);
    },
    [cloudSortActive],
  );

  const openGeminiSetupModal = useCallback(() => {
    setGeminiSetupModalOpen(true);
  }, []);

  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const isDesktopManaged = hasEntitlementIpc();
  const deferProductTour = shouldDeferProductTourAutoOpen({
    showWelcome: welcome.showWelcome,
    needsCloudAccount,
    launchSphereSplashOpen: welcome.launchSphereSplashOpen,
    isDesktopManaged,
    backendOnline,
  });
  useTourFirstRunAutoOpen({
    hydrated,
    showWelcome: welcome.showWelcome,
    needsCloudAccount,
    launchSphereSplashOpen: welcome.launchSphereSplashOpen,
    isDesktopManaged,
    backendOnline,
    setTourStep,
    setTourOpen,
  });

  const firstRunTourPending = useMemo(
    () =>
      isFirstRunProductTourPending({
        hydrated,
        showWelcome: welcome.showWelcome,
        needsCloudAccount,
        launchSphereSplashOpen: welcome.launchSphereSplashOpen,
        tourOpen,
      }),
    [hydrated, welcome.showWelcome, needsCloudAccount, welcome.launchSphereSplashOpen, tourOpen],
  );

  const [helpOpen, setHelpOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const helpFocusReturnRef = useRef<HTMLElement | null>(null);
  const prevHelpOpenRef = useRef(helpOpen);

  const settingsGuard = useSettingsTabGuard({
    tab,
    setTab,
    settings,
    setSettings,
    refreshTree,
  });

  const {
    registerSettingsScroll,
    registerSettingsSubTabSelector,
    jumpToSettingsSection,
    openPrimarySettings,
    openSettingsHome,
  } = useSettingsNavigation(settingsGuard.requestTab);

  useEffect(() => {
    const onOpenSettingsSection = (ev: Event) => {
      const sectionId = (ev as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
      if (sectionId) jumpToSettingsSection(sectionId);
    };
    window.addEventListener("exosites-open-settings-section", onOpenSettingsSection);
    return () => window.removeEventListener("exosites-open-settings-section", onOpenSettingsSection);
  }, [jumpToSettingsSection]);

  useOutputFolderSortTabToast({
    hydrated,
    mainAppReady: entitlementMainAppReady,
    tab,
    outputDir: settings.outputDir,
    uiLocale,
    jumpToSettingsSection,
  });

  const tourNavigate = useCallback(
    (t: Tab) => {
      setTab(t);
      if (t === "overview") void refreshTree();
    },
    [refreshTree, setTab],
  );

  const markTourComplete = useCallback(() => {
    try {
      localStorage.setItem(TOUR_COMPLETED_STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const openTour = useCallback(() => {
    setTourStep(0);
    setTourOpen(true);
  }, []);

  const openHelpModal = useCallback(() => {
    const a = document.activeElement;
    if (a instanceof HTMLElement) helpFocusReturnRef.current = a;
    setHelpOpen(true);
  }, []);

  const backendRetryInFlightRef = useRef(false);
  const [backendRetryBusy, setBackendRetryBusy] = useState(false);

  const handleRetryBackend = useCallback(async (opts?: { silent?: boolean }) => {
    if (typeof window.electronAPI?.restartBackend !== "function") return;
    if (backendRetryInFlightRef.current) return;
    backendRetryInFlightRef.current = true;
    setBackendRetryBusy(true);
    beginBackendStartupProbe();
    const silent = opts?.silent === true;
    try {
      const r = await window.electronAPI.restartBackend();
      if (silent) return;
      if (r.ok) {
        toast.success(translate(uiLocale, "toast.apiConnected"), { id: "backend-connected" });
      } else if (r.reason === "starting") {
        toast.message(translate(uiLocale, "toast.apiStillStarting"), { duration: 8000 });
      } else if (r.reason === "skip_backend") {
        toast.message(translate(uiLocale, "toast.skipBackend", { port: BACKEND_PORT }), {
          duration: 6000,
        });
      } else if (import.meta.env.DEV) {
        toast.error(translate(uiLocale, "toast.apiOfflineTitle"), {
          description: translate(uiLocale, "toast.apiOfflineDescDev", { port: BACKEND_PORT }),
          duration: 12_000,
        });
      } else {
        toast.error(translate(uiLocale, "toast.apiOfflineTitle"), {
          description: translate(uiLocale, "toast.apiOfflineDescPackaged"),
          duration: 12_000,
        });
      }
    } finally {
      backendRetryInFlightRef.current = false;
      setBackendRetryBusy(false);
    }
  }, [uiLocale, beginBackendStartupProbe]);

  const { autoRecoveryExhausted } = useBackendAutoRecovery(
    backendStartupFailed,
    backendOnline,
    handleRetryBackend,
    backendRetryBusy,
  );

  const replayTourFromHelp = useCallback(() => {
    setHelpOpen(false);
    openTour();
  }, [openTour]);

  useEffect(() => {
    if (prevHelpOpenRef.current && !helpOpen) {
      const el = helpFocusReturnRef.current;
      helpFocusReturnRef.current = null;
      if (el && document.contains(el)) {
        try {
          el.focus();
        } catch {
          /* ignore */
        }
      }
    }
    prevHelpOpenRef.current = helpOpen;
  }, [helpOpen]);

  useAppTelemetry({
    hydrated,
    telemetryOptIn: settings.telemetryOptIn,
    crashReportsOptIn: settings.crashReportsOptIn,
    uiLocale: settings.uiLocale,
    tab,
    backendOnline,
  });

  useTelemetryHeartbeat(settings.telemetryOptIn, settings.uiLocale);

  useSystemCommandDelegate({
    requestTab: settingsGuard.requestTab,
    openHelpModal,
    openTour,
  });

  const toastEntitlementBlocked = useCallback(() => {
    toast.error(translate(uiLocale, "toast.entitlementBlockedTitle"), {
      description: translate(uiLocale, "toast.entitlementBlockedDesc"),
      duration: 12000,
    });
    openPrimarySettings("license");
  }, [uiLocale, openPrimarySettings]);

  const toastCloudAccountRequired = useCallback(() => {
    toast.error(translate(uiLocale, "toast.cloudAccountRequiredTitle"), {
      description: translate(uiLocale, "toast.cloudAccountRequiredDesc"),
      duration: 12000,
    });
  }, [uiLocale]);

  const commandPaletteCommands = useCommandPaletteCommands(
    uiLocale,
    settings.outputDir,
    settingsGuard.requestTab,
    openHelpModal,
    openTour,
    jumpToSettingsSection,
    openSettingsHome,
    { includeAccountSettings: entitlement?.cloudAuthRequired === true, cloudSortActive },
  );

  useCommandPaletteShortcuts({
    helpOpen,
    setHelpOpen,
    setCommandPaletteOpen,
    openHelpModal,
    requestTab: settingsGuard.requestTab,
    openSettingsHome: openSettingsHome,
    tourOpen,
    settingsUnsavedOpen: settingsGuard.settingsUnsavedOpen,
    showWelcome: welcome.showWelcome,
    launchSphereSplashOpen: welcome.launchSphereSplashOpen,
    reassignFile,
    needsCloudAccount,
  });

  const baseNavItems = useMainNavItems(uiLocale);
  const todoFeed = useTodoFeed(backendOnline && entitlementMainAppReady);
  const navItems = useMemo(() => {
    let persona: "files" | "assistant" | null = null;
    try {
      const v = localStorage.getItem(SIDEBAR_PERSONA_STORAGE_KEY);
      if (v === "files" || v === "assistant") persona = v;
    } catch {
      /* ignore */
    }
    return applyTodoNavBadges(orderNavItemsByPersona(baseNavItems, persona), todoFeed.counts);
  }, [baseNavItems, todoFeed.counts]);

  const tourStepMeta = useMemo(
    () => buildProductTourStepMeta(cloudSortActive),
    [cloudSortActive],
  );

  const tourHighlightId = productTourHighlightId(tourStepMeta, tourStep, tourOpen);

  return {
    backendOnline,
    lastHealthOkAt,
    backendHealthProbing,
    backendServiceStarting,
    backendStartupFailed,
    backendRetryBusy,
    backendAutoRecoveryExhausted: autoRecoveryExhausted,
    theme,
    toggleTheme,
    entitlement,
    entitlementLoaded,
    refreshEntitlement,
    refreshEntitlementWithStatus,
    needsCloudAccount,
    mainAppReady: entitlementMainAppReady,
    modelHook,
    handleSwitchAccount,
    modelDownloadModalRole,
    setModelDownloadModalRole,
    geminiSetupModalOpen,
    setGeminiSetupModalOpen,
    openModelDownloadModal,
    openGeminiSetupModal,
    tourOpen,
    tourStep,
    setTourStep,
    setTourOpen,
    deferProductTour,
    firstRunTourPending,
    helpOpen,
    setHelpOpen,
    commandPaletteOpen,
    setCommandPaletteOpen,
    ...welcome,
    ...settingsGuard,
    registerSettingsScroll,
    registerSettingsSubTabSelector,
    jumpToSettingsSection,
    openPrimarySettings,
    openSettingsHome,
    tourNavigate,
    markTourComplete,
    openTour,
    openHelpModal,
    handleRetryBackend,
    replayTourFromHelp,
    toastEntitlementBlocked,
    toastCloudAccountRequired,
    commandPaletteCommands,
    navItems,
    todoFeed,
    cloudSortActive,
    tourStepMeta,
    tourHighlightId,
  };
}
