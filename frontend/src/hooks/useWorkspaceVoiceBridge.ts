import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import type { EntitlementStatus } from "../api";
import type { AppSettings } from "../types/settings";
import type { MainNavTab } from "../hooks/useMainNavItems";
import { voicePaidAllowed } from "../utils/voicePaidAccess";
import { CLAP_WAKE_VOICE_EVENT } from "../constants";
import { openPrimarySettingsSection } from "../utils/settingsNav";
import { assertVoiceBackendReady } from "../voice/ensureVoiceBackendReady";
import {
  CONVERSATION_LAND_UNMUTE_GRACE_MS,
  conversationLandMicAction,
} from "../voice/conversationLandMic";
import { useVoiceSession, type UseVoiceSessionReturn } from "./useVoiceSession";
import { useBriefingOfferUi, type UseBriefingOfferUiReturn } from "./useBriefingOfferUi";
import { usePushToTalk } from "./usePushToTalk";
import {
  formatConnectResultForVoice,
  notifyIntegrationChanged,
  recordConnectTrace,
  type ConnectVerification,
} from "../assistant/integrationTokenRelay";
import type { IntegrationClientAction } from "../assistant/integrationClientActions";
import { useI18n } from "../i18n/I18nContext";

type VoiceToolRunningPayload = {
  tools: string[];
  planTaskId?: string;
  planGoal?: string;
};

type VoiceToolResultPayload = {
  tool: string;
  callId: string;
  result: unknown;
};

type UseWorkspaceVoiceBridgeOptions = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  settingsHydrated: boolean;
  backendOnline: boolean;
  entitlement: EntitlementStatus | null;
  entitlementLoaded: boolean;
  toastEntitlementBlocked: () => void;
  activeTab: MainNavTab;
  jumpToSettingsSection: (sectionId: string) => void;
  onRetryBackend?: () => void | Promise<void>;
  onToolRunning: (payload: VoiceToolRunningPayload) => void;
  onToolResult: (payload: VoiceToolResultPayload) => void;
};

type UseWorkspaceVoiceBridgeReturn = {
  voice: UseVoiceSessionReturn;
  briefingOffer: UseBriefingOfferUiReturn;
  pushToTalk: ReturnType<typeof usePushToTalk>;
  isConversationVoiceMode: boolean;
  openVoiceInteractionSettings: () => void;
  handleAlwaysAllowVoiceTool: (tool: string) => void;
  /** Freeze Tesseract analyser polling (idle/unfocused/off-tab). */
  setVisualAnalysisSuspended: (suspended: boolean) => void;
  runIntegrationVoiceAction: (
    action: IntegrationClientAction,
    providerId: string,
    providerLabel: string,
  ) => Promise<void>;
};

/**
 * Shell-level voice session, PTT wiring, credential sync, and integration voice actions.
 */
export function useWorkspaceVoiceBridge({
  settings,
  setSettings,
  settingsHydrated,
  backendOnline,
  entitlement,
  entitlementLoaded,
  toastEntitlementBlocked,
  activeTab,
  jumpToSettingsSection,
  onRetryBackend,
  onToolRunning,
  onToolResult,
}: UseWorkspaceVoiceBridgeOptions): UseWorkspaceVoiceBridgeReturn {
  const { t } = useI18n();
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const visualAnalysisSuspendedRef = useRef(activeTab !== "exo");
  const setVisualAnalysisSuspended = useCallback((suspended: boolean) => {
    visualAnalysisSuspendedRef.current = suspended;
  }, []);
  useEffect(() => {
    if (activeTab !== "exo") {
      visualAnalysisSuspendedRef.current = true;
    }
  }, [activeTab]);

  useEffect(() => {
    if (!settingsHydrated || !backendOnline) return;
    const handle = window.setTimeout(() => {
      void assertVoiceBackendReady(settings, { backendOnline }).catch(() => {});
    }, 400);
    return () => window.clearTimeout(handle);
  }, [settingsHydrated, backendOnline, settings.geminiApiKey, settings.chatProviders?.gemini?.apiKey]);

  const voice = useVoiceSession({
    memoryEnabled: settings.assistantMemoryEnabled,
    alwaysApprovedTools: settings.voiceToolsAlwaysApproved,
    settings,
    visualAnalysisSuspendedRef,
    beforeSessionStart: async () => {
      await assertVoiceBackendReady(settings, { backendOnline });
    },
    shouldNotifyError: () => activeTabRef.current !== "exo",
    resolveAction: (id) => {
      if (id === "settings:ai-provider") {
        return () => openPrimarySettingsSection(jumpToSettingsSection, { section: "aiProvider" });
      }
      if (id === "settings:models") {
        return () => openPrimarySettingsSection(jumpToSettingsSection, { section: "models" });
      }
      if (id === "backend:retry" && onRetryBackend) {
        return () => void onRetryBackend();
      }
      return undefined;
    },
    onToolRunning,
    onToolResult,
  });

  const startIfPaid = useCallback(async () => {
    if (!entitlementLoaded) return;
    if (!voicePaidAllowed(entitlement, entitlementLoaded)) {
      toastEntitlementBlocked();
      return;
    }
    await voice.start();
  }, [entitlement, entitlementLoaded, toastEntitlementBlocked, voice.start]);

  const startLandIfPaid = useCallback(async () => {
    if (!voicePaidAllowed(entitlement, entitlementLoaded)) return;
    await voice.startForLandOffer();
  }, [entitlement, entitlementLoaded, voice.startForLandOffer]);

  const startPttIfPaid = useCallback(async () => {
    if (!entitlementLoaded) return;
    if (!voicePaidAllowed(entitlement, entitlementLoaded)) {
      toastEntitlementBlocked();
      return;
    }
    await voice.startForPushToTalk();
  }, [entitlement, entitlementLoaded, toastEntitlementBlocked, voice.startForPushToTalk]);

  const gatedVoice = useMemo(
    () => ({
      ...voice,
      start: startIfPaid,
      startForLandOffer: startLandIfPaid,
      startForPushToTalk: startPttIfPaid,
    }),
    [voice, startIfPaid, startLandIfPaid, startPttIfPaid],
  );

  const sendJsonFrame = voice.sendJsonFrame;
  const setOnBriefingOfferEvent = voice.setOnBriefingOfferEvent;

  const briefingOffer = useBriefingOfferUi({
    sendFrame: sendJsonFrame,
  });

  useEffect(() => {
    setOnBriefingOfferEvent(briefingOffer.handleServerEvent);
    return () => setOnBriefingOfferEvent(null);
  }, [setOnBriefingOfferEvent, briefingOffer.handleServerEvent]);

  const hadVoiceSessionRef = useRef(false);
  useEffect(() => {
    const sessionOpen = voice.isListening || voice.isReconnecting;
    if (hadVoiceSessionRef.current && !sessionOpen) {
      briefingOffer.clearLocal();
    }
    hadVoiceSessionRef.current = sessionOpen;
  }, [voice.isListening, voice.isReconnecting, briefingOffer.clearLocal]);

  // Land warm (muted): deliver BriefingOffer on app ready without waiting for first utterance.
  // Conversation + voiceAutoStart already opens unmuted with startup=1 via ExoPanel — skip duplicate.
  const landOfferStartedRef = useRef(false);
  useEffect(() => {
    if (!settingsHydrated || !backendOnline || !entitlementLoaded) return;
    if (!voicePaidAllowed(entitlement, entitlementLoaded)) {
      landOfferStartedRef.current = false;
      return;
    }
    if (landOfferStartedRef.current) return;
    if (voice.isListening || voice.isReconnecting) return;
    if (settings.voiceInteractionMode === "conversation" && settings.voiceAutoStart) return;
    landOfferStartedRef.current = true;
    void startLandIfPaid();
  }, [
    settingsHydrated,
    backendOnline,
    entitlement,
    entitlementLoaded,
    settings.voiceInteractionMode,
    settings.voiceAutoStart,
    voice.isListening,
    voice.isReconnecting,
    startLandIfPaid,
  ]);

  useEffect(() => {
    if (!entitlementLoaded) return;
    if (voicePaidAllowed(entitlement, entitlementLoaded)) return;
    if (voice.isListening || voice.isReconnecting) {
      voice.stop();
    }
  }, [
    entitlement,
    entitlementLoaded,
    voice.isListening,
    voice.isReconnecting,
    voice.stop,
  ]);

  // Land starts muted; conversation must open the mic once the card is up
  // (or shortly after, if no offer arrives). PTT stays muted until the key.
  // Once-per-listen: setMicCaptureEnabled(true) also clears barge-in.
  const conversationMicOpenedRef = useRef(false);
  useEffect(() => {
    if (!voice.isListening) {
      conversationMicOpenedRef.current = false;
      return;
    }
    const action = conversationLandMicAction({
      mode: settings.voiceInteractionMode,
      isListening: voice.isListening,
      offerPhase: briefingOffer.phase,
    });
    if (action === "hold") return;
    const openMic = () => {
      if (conversationMicOpenedRef.current) return;
      conversationMicOpenedRef.current = true;
      voice.setMicCaptureEnabled(true);
    };
    if (action === "unmute") {
      openMic();
      return;
    }
    const handle = window.setTimeout(openMic, CONVERSATION_LAND_UNMUTE_GRACE_MS);
    return () => window.clearTimeout(handle);
  }, [
    settings.voiceInteractionMode,
    voice.isListening,
    briefingOffer.phase,
    voice.setMicCaptureEnabled,
  ]);

  const pushToTalk = usePushToTalk({
    settings,
    voice: gatedVoice,
    backendOnline,
  });

  const isConversationVoiceMode = settings.voiceInteractionMode === "conversation";

  const openVoiceInteractionSettings = useCallback(() => {
    jumpToSettingsSection("settings-anchor-voice");
  }, [jumpToSettingsSection]);

  const previousVoiceModeRef = useRef(settings.voiceInteractionMode);
  useEffect(() => {
    if (previousVoiceModeRef.current === settings.voiceInteractionMode) return;
    previousVoiceModeRef.current = settings.voiceInteractionMode;
    voice.stopImmediate();
    voice.dismissError();
  }, [settings.voiceInteractionMode, voice.stopImmediate, voice.dismissError]);

  const runIntegrationVoiceAction = useCallback(
    async (
      action: IntegrationClientAction,
      providerId: string,
      providerLabel: string,
    ) => {
      if (action === "open_whatsapp_setup") return;
      const electron = window.electronAPI;
      if (!electron?.integrationConnect || !electron?.integrationDisconnect) {
        toast.error(t("assistant.voiceConnectionUnavailableTitle"), {
          description: t("assistant.voiceConnectionUnavailableDetail"),
        });
        return;
      }
      const connecting = action === "integration_connect";
      try {
        const res = connecting
          ? await electron.integrationConnect({ providerId, autopilot: true })
          : await electron.integrationDisconnect({ providerId });
        const verification = (res as { verification?: ConnectVerification } | undefined)?.verification;

        if (connecting) {
          await voice.relayIntegrationTokens();
        }

        recordConnectTrace({
          providerId,
          providerLabel,
          ok: Boolean(res?.ok),
          reason: res?.reason,
          verification,
        });

        if (res?.ok) {
          notifyIntegrationChanged(providerId);
          if (voice.isListening) {
            voice.sendText(formatConnectResultForVoice(providerId, providerLabel, true, verification));
          }
          toast.success(
            connecting
              ? t("assistant.voiceConnectionConnected", { provider: providerLabel })
              : t("assistant.voiceConnectionDisconnected", { provider: providerLabel }),
          );
        } else {
          if (connecting && voice.isListening) {
            voice.sendText(
              formatConnectResultForVoice(
                providerId,
                providerLabel,
                false,
                verification,
                res?.reason,
              ),
            );
          }
          toast.error(
            connecting
              ? t("assistant.voiceConnectionConnectFailed", { provider: providerLabel })
              : t("assistant.voiceConnectionDisconnectFailed", { provider: providerLabel }),
            { description: res?.reason },
          );
        }
      } catch {
        toast.error(
          connecting
            ? t("assistant.voiceConnectionConnectFailed", { provider: providerLabel })
            : t("assistant.voiceConnectionDisconnectFailed", { provider: providerLabel }),
        );
      }
    },
    [t, voice.isListening, voice.relayIntegrationTokens, voice.sendText],
  );

  useEffect(() => {
    if (!isConversationVoiceMode) return;
    const onClapWakeVoice = () => {
      if (voice.isListening || voice.isReconnecting) return;
      void startIfPaid();
    };
    window.addEventListener(CLAP_WAKE_VOICE_EVENT, onClapWakeVoice);
    return () => window.removeEventListener(CLAP_WAKE_VOICE_EVENT, onClapWakeVoice);
  }, [isConversationVoiceMode, voice.isListening, voice.isReconnecting, startIfPaid]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F4" || !isConversationVoiceMode) return;
      e.preventDefault();
      if (voice.isListening || voice.isReconnecting) {
        voice.stop();
        voice.dismissError();
      } else {
        void startIfPaid();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    isConversationVoiceMode,
    voice.isListening,
    voice.isReconnecting,
    startIfPaid,
    voice.stop,
    voice.dismissError,
  ]);

  const handleAlwaysAllowVoiceTool = useCallback(
    (tool: string) => {
      setSettings((s) => {
        if (s.voiceToolsAlwaysApproved.includes(tool)) return s;
        return { ...s, voiceToolsAlwaysApproved: [...s.voiceToolsAlwaysApproved, tool] };
      });
    },
    [setSettings],
  );

  return {
    voice: gatedVoice,
    briefingOffer,
    pushToTalk,
    isConversationVoiceMode,
    openVoiceInteractionSettings,
    handleAlwaysAllowVoiceTool,
    setVisualAnalysisSuspended,
    runIntegrationVoiceAction,
  };
}
