import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { AppSettings } from "../types/settings";
import type { MainNavTab } from "../hooks/useMainNavItems";
import { CLAP_WAKE_VOICE_EVENT } from "../constants";
import { openPrimarySettingsSection } from "../utils/settingsNav";
import { assertVoiceBackendReady } from "../voice/ensureVoiceBackendReady";
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
    if (!settingsHydrated || !backendOnline) return;
    if (landOfferStartedRef.current) return;
    if (voice.isListening || voice.isReconnecting) return;
    if (settings.voiceInteractionMode === "conversation" && settings.voiceAutoStart) return;
    landOfferStartedRef.current = true;
    void voice.startForLandOffer();
  }, [
    settingsHydrated,
    backendOnline,
    settings.voiceInteractionMode,
    settings.voiceAutoStart,
    voice.isListening,
    voice.isReconnecting,
    voice.startForLandOffer,
  ]);

  const pushToTalk = usePushToTalk({
    settings,
    voice,
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
      void voice.start();
    };
    window.addEventListener(CLAP_WAKE_VOICE_EVENT, onClapWakeVoice);
    return () => window.removeEventListener(CLAP_WAKE_VOICE_EVENT, onClapWakeVoice);
  }, [isConversationVoiceMode, voice.isListening, voice.isReconnecting, voice.start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F4" || !isConversationVoiceMode) return;
      e.preventDefault();
      if (voice.isListening || voice.isReconnecting) {
        voice.stop();
        voice.dismissError();
      } else {
        void voice.start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    isConversationVoiceMode,
    voice.isListening,
    voice.isReconnecting,
    voice.start,
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
    voice,
    briefingOffer,
    pushToTalk,
    isConversationVoiceMode,
    openVoiceInteractionSettings,
    handleAlwaysAllowVoiceTool,
    setVisualAnalysisSuspended,
    runIntegrationVoiceAction,
  };
}
