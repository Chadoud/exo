/**
 * useVoiceSession — real-time voice with the Gemini Live API backend.
 *
 * Composes {@link useVoiceAudio} (mic/worklet/echo/barge-in) and
 * {@link useVoiceWebSocket} (WS lifecycle + frame routing).
 *
 * Exposes:
 *   isListening     — mic is open and streaming
 *   isReconnecting  — backend is reconnecting the Gemini Live session
 *   inputTranscript — what the user said (current turn)
 *   outputTranscript — what the AI said (current turn)
 *   visualMetricsRef — mic amplitude + spectrum; mutated ~20 Hz (read via ref, not React)
 *   error / errorActionId — last error + actionable category
 *   start()         — opens mic + WS
 *   stop()          — closes session
 *   dismissError()  — clears error overlay
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type {
  ServerTurnCommitPayload,
  VoiceTurnCommitMeta,
} from "../features/assistant/chat/commitAssistantTurn";
import { VOICE_MIC_ACTIVE_EVENT } from "../constants";
import type { AppSettings } from "../types/settings";
import { relayConnectorTokens } from "../assistant/connectorContext";
import { relayIntegrationTokensAfterConnect } from "../assistant/integrationTokenRelay";
import { type ErrorActionId, errorActionId, toastUserError } from "../utils/userGuidance";
import { isPersistentVoiceIssue } from "../utils/voiceSessionIssue";
import type {
  VoiceFrameRouterDeps,
  VoiceToolResultPayload,
  VoiceToolRunningPayload,
  VoiceTurnTraceEntry,
} from "../voice/voiceFrameRouter";
import type { BriefingOfferServerEvent } from "../voice/briefingOfferTypes";
import { cancelDelayedTranscriptReset } from "../voice/voiceTranscriptCommit";
import { useVoiceAudio } from "../voice/useVoiceAudio";
import { useVoiceWebSocket } from "../voice/useVoiceWebSocket";
import type { VoiceVisualMetrics } from "../voice/voiceVisualMetrics";

// ── Hook types ───────────────────────────────────────────────────────────────

/**
 * Hook return types for `useVoiceSession`.
 */
export interface PendingToolApproval {
  tool: string;
  callId: string;
}

export interface UseVoiceSessionReturn {
  isListening: boolean;
  /** True while the backend is reconnecting the Gemini Live session. */
  isReconnecting: boolean;
  inputTranscript: string;
  outputTranscript: string;
  /** Live mic/playback metrics — imperative reads for Tesseract RAF (no per-tick re-renders). */
  visualMetricsRef: MutableRefObject<VoiceVisualMetrics>;
  /** Waiting for user approval for screen_capture / code_runner (voice tools). */
  pendingToolApproval: PendingToolApproval | null;
  /** Short label while Gemini Live is executing a tool (e.g. google_workspace). */
  toolPhaseLabel: string | null;
  /**
   * Source identifier of the last tool that produced a response.
   * Used to show a provider icon alongside the output transcript.
   * One of: "google_workspace" | "microsoft_graph" | "infomaniak_services" | null.
   */
  lastToolSource: string | null;
  error: string | null;
  /** Action ID of the last error — used by components to show a contextual "Fix it" button. */
  errorActionId: ErrorActionId | undefined;
  /**
   * True after `stop()` or other session teardown that should not self-restart the mic —
   * e.g. Exo auto-start must not fire again until the user (or `start()`) re-opens the session.
   */
  micAutostartSuppressed: boolean;
  start: () => Promise<void>;
  stop: () => void;
  /**
   * Hard stop that cuts the mic and silences any in-progress AI speech immediately
   * (including the startup briefing). Used when the app window is hidden to the tray.
   */
  stopImmediate: () => void;
  /** Clear the last error (e.g. when user dismisses the error overlay). */
  dismissError: () => void;
  /** Send approval for a pending Gemini tool call (matches call_id from the server). */
  approveToolCall: (callId: string, scope?: "once" | "session") => void;
  /** Deny a pending tool call. */
  denyToolCall: (callId: string) => void;
  /**
   * Stop an in-progress startup briefing so a new user task can take over.
   * Silences buffered AI audio and tells the backend to cancel queued sections.
   */
  interruptBriefing: () => void;
  /**
   * Inject a typed text message directly into the active Gemini Live session.
   * Mirrors Mark-XXXIX's `_on_text_command` so typed follow-ups share the same
   * conversation context as prior voice turns instead of going to a separate LLM.
   * Aborts any active briefing first. No-op when voice is not connected.
   */
  sendText: (text: string) => void;
  /**
   * The briefing section currently being spoken, or null when no briefing is
   * active. One of: "news" | "weather" | "calendar" | "mail".
   * Updated on `briefing_progress` frames from the backend pipeline.
   */
  briefingSection: string | null;
  /** Push OAuth tokens to the backend after the voice WebSocket connects. */
  relayIntegrationTokens: () => Promise<void>;
  /** True while push-to-talk key is held and live mic audio is forwarded. */
  isPttCapturing: boolean;
  /** Open a warm voice session with the mic muted until push-to-talk capture starts. */
  startForPushToTalk: () => Promise<void>;
  /** Muted land warm so BriefingOffer can ask before the user speaks. */
  startForLandOffer: () => Promise<void>;
  /** Mute or unmute outbound mic PCM without tearing down the session. */
  setMicCaptureEnabled: (enabled: boolean) => void;
  /** Start buffering mic audio before the PTT session finishes warming up. */
  beginPttCaptureWarmup: () => void;
  /** Tell the backend to finalize the current push-to-talk utterance (ActivityEnd). */
  sendPttTurnEnd: () => void;
  /**
   * Metadata for the voice turn that just completed — tool name, briefing section, etc.
   * Call once when persisting transcripts to chat; clears the pending snapshot.
   */
  consumeTurnCommitMeta: () => VoiceTurnCommitMeta;
  /** Register a callback invoked on each voice turn_complete (server-authoritative). */
  setOnTurnComplete: (handler: ((payload: ServerTurnCommitPayload) => void) | null) => void;
  /** Register a chained handler for voice tool_result frames (runs after shell handlers). */
  setOnToolResult: (handler: ((payload: VoiceToolResultPayload) => void) | null) => void;
  /** Register a chained handler for voice tool_running frames. */
  setOnToolRunning: (handler: ((payload: VoiceToolRunningPayload) => void) | null) => void;
  /** Register a handler for BriefingOffer server frames (offer / loading / error / clear). */
  setOnBriefingOfferEvent: (
    handler: ((event: BriefingOfferServerEvent) => void) | null,
  ) => void;
  /** Send an arbitrary JSON frame on the open voice WebSocket (no-op when disconnected). */
  sendJsonFrame: (frame: Record<string, unknown>) => void;
  /** Sync a pending calendar delete draft to the voice backend (survives Gemini reconnect). */
  sendPendingCalendarDeleteSync: (draft: Record<string, unknown> | null) => void;
  /** Last few voice turn diagnostics from the backend (for debug export). */
  voiceTurnTraces: VoiceTurnTraceEntry[];
}

export type { VoiceTurnCommitMeta };

interface UseVoiceSessionOptions {
  /**
   * When false, passes `?memory=0` to the voice WebSocket so the backend
   * skips injecting stored memory into the system prompt and removes the
   * `save_memory` tool from the Gemini Live session.
   * Defaults to true.
   */
  memoryEnabled?: boolean;
  /**
   * Called when the backend starts executing one or more tools (before `tool_result`).
   * Use to switch UI (e.g. Sort tab) as soon as a long-running tool like `start_local_file_sort` begins.
   */
  onToolRunning?: (payload: VoiceToolRunningPayload) => void;
  /**
   * Called for every `tool_result` frame — e.g. switch tabs when voice enqueues Sort jobs.
   */
  onToolResult?: (payload: VoiceToolResultPayload) => void;
  /**
   * Maps an ErrorActionId to the navigation callback that fixes it.
   * When provided, voice error toasts will include a "Fix it" button.
   */
  resolveAction?: (id: ErrorActionId) => (() => void) | undefined;
  /**
   * Voice tool names (e.g. screen_capture) pre-approved in Settings — skips the consent modal.
   */
  alwaysApprovedTools?: readonly string[];
  /**
   * Called before opening mic/WS — e.g. sync Gemini key to backend env for voice.
   */
  beforeSessionStart?: () => Promise<void>;
  /**
   * When false, skip global error toasts (inline UI on Exo handles them).
   */
  shouldNotifyError?: () => boolean;
  /** Active app settings — used to relay chat provider credentials over the voice WS. */
  settings?: AppSettings;
  /**
   * When true, mic analyser polling for Tesseract visuals is skipped (Exo off-tab).
   * Ref is read on each tick so the parent can flip it without restarting capture.
   */
  visualAnalysisSuspendedRef?: React.RefObject<boolean>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useVoiceSession(options?: UseVoiceSessionOptions): UseVoiceSessionReturn {
  const resolveActionRef = useRef(options?.resolveAction);
  resolveActionRef.current = options?.resolveAction;

  const onToolResultRef = useRef(options?.onToolResult);
  onToolResultRef.current = options?.onToolResult;

  const onToolResultChainedRef = useRef<((payload: VoiceToolResultPayload) => void) | null>(null);

  const onToolRunningRef = useRef(options?.onToolRunning);
  onToolRunningRef.current = options?.onToolRunning;
  const onToolRunningChainedRef = useRef<((payload: VoiceToolRunningPayload) => void) | null>(null);
  const onBriefingOfferEventRef = useRef<((event: BriefingOfferServerEvent) => void) | null>(null);

  const memoryEnabledRef = useRef(options?.memoryEnabled ?? true);
  memoryEnabledRef.current = options?.memoryEnabled ?? true;

  const alwaysApprovedToolsRef = useRef(options?.alwaysApprovedTools ?? []);
  alwaysApprovedToolsRef.current = options?.alwaysApprovedTools ?? [];

  const beforeSessionStartRef = useRef(options?.beforeSessionStart);
  beforeSessionStartRef.current = options?.beforeSessionStart;

  const shouldNotifyErrorRef = useRef(options?.shouldNotifyError);
  shouldNotifyErrorRef.current = options?.shouldNotifyError;

  const settingsRef = useRef(options?.settings);
  settingsRef.current = options?.settings;

  const internalVisualAnalysisSuspendedRef = useRef(false);
  const visualAnalysisSuspendedRef =
    options?.visualAnalysisSuspendedRef ?? internalVisualAnalysisSuspendedRef;

  const stoppedRef = useRef(false);
  const startupFiredRef = useRef(false);
  const briefingActiveRef = useRef(false);
  const briefingSectionRef = useRef<string | null>(null);
  const turnToolNameRef = useRef<string | null>(null);
  const lastToolSourceRef = useRef<string | null>(null);
  const pendingTurnCommitRef = useRef<VoiceTurnCommitMeta | null>(null);
  const onTurnCompleteRef = useRef<((payload: ServerTurnCommitPayload) => void) | null>(null);
  const deferredStopRef = useRef(false);
  const outputTranscriptRef = useRef("");
  const recentAssistantLinesRef = useRef<string[]>([]);
  const startInProgressRef = useRef(false);
  const skipStartupBriefingRef = useRef(false);
  const voiceSessionIdRef = useRef("");
  const startMutedMicRef = useRef(false);
  const frameRouterDepsRef = useRef<VoiceFrameRouterDeps | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const cancelReconnectTimerRef = useRef<() => void>(() => {});
  const attachPcmForwarderRef = useRef<(ws: WebSocket) => void>(() => {});
  const tokensRelayedRef = useRef(false);
  const transcriptResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voiceTurnTraces, setVoiceTurnTraces] = useState<VoiceTurnTraceEntry[]>([]);

  const resetTranscripts = useCallback(() => {
    setInputTranscript("");
    setOutputTranscript("");
    outputTranscriptRef.current = "";
  }, []);

  const [isListening, setIsListening] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [inputTranscript, setInputTranscript] = useState("");
  const [outputTranscript, setOutputTranscript] = useState("");
  const [pendingToolApproval, setPendingToolApproval] = useState<PendingToolApproval | null>(null);
  const [toolPhaseLabel, setToolPhaseLabel] = useState<string | null>(null);
  const [lastToolSource, setLastToolSource] = useState<string | null>(null);
  const assignToolSource = (source: string | null) => {
    lastToolSourceRef.current = source;
    setLastToolSource(source);
  };
  const clearToolSource = () => assignToolSource(null);
  const [error, setError] = useState<string | null>(null);
  const [currentErrorActionId, setCurrentErrorActionId] = useState<ErrorActionId | undefined>(undefined);
  const currentErrorActionIdRef = useRef<ErrorActionId | undefined>(undefined);
  currentErrorActionIdRef.current = currentErrorActionId;
  const reconnectAttemptCountRef = useRef(0);
  const [micAutostartSuppressed, setMicAutostartSuppressed] = useState(false);
  const [briefingSection, setBriefingSection] = useState<string | null>(null);
  briefingSectionRef.current = briefingSection;

  const {
    streamRef,
    micMutedRef,
    frameRouterRefs,
    visualMetricsRef,
    isPttCapturing,
    startCapture,
    teardown: teardownAudio,
    attachPcmForwarder,
    setMicCaptureEnabled,
    beginPttCaptureWarmup,
    resetForSessionStart,
    resetOnWsClose,
    resetBargeIn,
    flushPlayback,
    clearMicPreRoll,
    resetAmplitudeVisuals,
    setPttCapturing,
  } = useVoiceAudio({
    tokensRelayedRef,
    visualAnalysisSuspendedRef,
  });

  const handleWsClose = useCallback(() => {
    resetOnWsClose();
    setInputTranscript("");
    setOutputTranscript("");
    outputTranscriptRef.current = "";
  }, [resetOnWsClose]);

  const {
    wsRef,
    openWebSocket,
    closeWebSocket,
    cancelReconnectTimer,
  } = useVoiceWebSocket({
    memoryEnabledRef,
    skipStartupBriefingRef,
    startupFiredRef,
    voiceSessionIdRef,
    stoppedRef,
    tokensRelayedRef,
    settingsRef,
    frameRouterDepsRef,
    setIsListening,
    setIsReconnecting,
    setError,
    onWsClose: handleWsClose,
    attachPcmForwarder: (ws) => attachPcmForwarderRef.current(ws),
  });

  cancelReconnectTimerRef.current = cancelReconnectTimer;
  attachPcmForwarderRef.current = attachPcmForwarder;

  const stop = useCallback(() => {
    if (briefingActiveRef.current) {
      stoppedRef.current = true;
      deferredStopRef.current = true;
      micMutedRef.current = true;
      setMicAutostartSuppressed(true);
      setIsListening(false);
      setToolPhaseLabel(null);
      clearToolSource();
      return;
    }

    stoppedRef.current = true;
    setMicAutostartSuppressed(true);
    cancelReconnectTimer();
    closeWebSocket();

    teardownAudio();

    cancelDelayedTranscriptReset(transcriptResetTimerRef);
    setIsListening(false);
    setIsReconnecting(false);
    resetAmplitudeVisuals();
    setPendingToolApproval(null);
    setToolPhaseLabel(null);
    clearToolSource();
    setBriefingSection(null);
    setPttCapturing(false);
    clearMicPreRoll();
  }, [
    cancelReconnectTimer,
    closeWebSocket,
    teardownAudio,
    micMutedRef,
    resetAmplitudeVisuals,
    clearMicPreRoll,
    setPttCapturing,
  ]);

  stopRef.current = stop;

  const clearEphemeralVoiceIssue = useCallback(() => {
    if (!isPersistentVoiceIssue(currentErrorActionIdRef.current)) {
      setError(null);
      setCurrentErrorActionId(undefined);
    }
  }, []);

  frameRouterDepsRef.current = {
    refs: {
      outputTranscript: outputTranscriptRef,
      recentAssistantLines: recentAssistantLinesRef,
      ...frameRouterRefs,
      briefingActive: briefingActiveRef,
      briefingSection: briefingSectionRef,
      deferredStop: deferredStopRef,
      stopped: stoppedRef,
      turnToolName: turnToolNameRef,
      lastToolSource: lastToolSourceRef,
      pendingTurnCommit: pendingTurnCommitRef,
      transcriptResetTimer: transcriptResetTimerRef,
      reconnectAttemptCount: reconnectAttemptCountRef,
    },
    actions: {
      setInputTranscript,
      setOutputTranscript,
      setBriefingSection,
      setIsReconnecting,
      setIsListening,
      setToolPhaseLabel,
      setPendingToolApproval,
      setError,
      setCurrentErrorActionId,
      setMicAutostartSuppressed,
      assignToolSource,
      clearToolSource,
      stop: () => stopRef.current(),
      cancelReconnectTimer: () => cancelReconnectTimerRef.current(),
      resetTranscripts,
      clearEphemeralVoiceIssue,
    },
    alwaysApprovedTools: alwaysApprovedToolsRef.current,
    onToolRunning: (payload) => {
      onToolRunningRef.current?.(payload);
      onToolRunningChainedRef.current?.(payload);
    },
    onToolResult: (payload) => {
      onToolResultRef.current?.(payload);
      onToolResultChainedRef.current?.(payload);
    },
    onTurnTrace: (traces) => setVoiceTurnTraces(traces),
    onTurnComplete: (payload) => onTurnCompleteRef.current?.(payload),
    onBriefingOfferEvent: (event) => onBriefingOfferEventRef.current?.(event),
    resolveAction: resolveActionRef.current,
    shouldNotifyToast: shouldNotifyErrorRef.current,
    ws: null,
  };

  const stopImmediate = useCallback(() => {
    briefingActiveRef.current = false;
    deferredStopRef.current = false;
    stop();
  }, [stop]);

  const start = useCallback(async () => {
    if (startInProgressRef.current) return;
    startInProgressRef.current = true;

    stoppedRef.current = false;
    briefingActiveRef.current = false;
    deferredStopRef.current = false;
    resetForSessionStart();
    reconnectAttemptCountRef.current = 0;
    setMicAutostartSuppressed(false);
    setError(null);
    setCurrentErrorActionId(undefined);
    setInputTranscript("");
    setOutputTranscript("");
    outputTranscriptRef.current = "";
    setIsReconnecting(false);
    setToolPhaseLabel(null);
    clearToolSource();
    setBriefingSection(null);
    voiceSessionIdRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `voice-${Date.now()}`;

    if (wsRef.current || streamRef.current) {
      cancelReconnectTimer();
      closeWebSocket(false);
      teardownAudio();
    }

    try {
      await beforeSessionStartRef.current?.();
      await startCapture();

      if (!window.electronAPI?.voicePrimeSession) {
        void relayConnectorTokens();
      }
      void openWebSocket();

      if (startMutedMicRef.current) {
        micMutedRef.current = true;
        setPttCapturing(false);
        startMutedMicRef.current = false;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not access microphone";
      setError(msg);
      setCurrentErrorActionId(errorActionId(e instanceof Error ? e : new Error(msg)));
      stop();
    } finally {
      startInProgressRef.current = false;
    }
  }, [
    openWebSocket,
    stop,
    cancelReconnectTimer,
    closeWebSocket,
    teardownAudio,
    startCapture,
    resetForSessionStart,
    micMutedRef,
    setPttCapturing,
    wsRef,
    streamRef,
  ]);

  useEffect(() => {
    if (!error) return;
    if (shouldNotifyErrorRef.current && !shouldNotifyErrorRef.current()) return;
    const actionId = currentErrorActionId;
    const handler = actionId ? resolveActionRef.current?.(actionId) : undefined;
    toastUserError(
      "Voice session error",
      new Error(error),
      handler ? { action: { label: "Fix in Settings", onClick: handler } } : undefined,
    );
  }, [error, currentErrorActionId]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(VOICE_MIC_ACTIVE_EVENT, {
        detail: { active: isListening || isReconnecting },
      }),
    );
  }, [isListening, isReconnecting]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      cancelReconnectTimer();
      teardownAudio();
      closeWebSocket(false);
    };
  }, [cancelReconnectTimer, closeWebSocket, teardownAudio]);

  const dismissError = useCallback(() => {
    setError(null);
    setCurrentErrorActionId(undefined);
  }, []);

  const approveToolCall = useCallback((callId: string, scope: "once" | "session" = "once") => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "tool_approved", call_id: callId, scope }));
    }
    setPendingToolApproval(null);
  }, [wsRef]);

  const denyToolCall = useCallback((callId: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "tool_denied", call_id: callId }));
    }
    setPendingToolApproval(null);
  }, [wsRef]);

  const interruptBriefing = useCallback(() => {
    briefingActiveRef.current = false;
    deferredStopRef.current = false;
    setBriefingSection(null);
    setToolPhaseLabel(null);
    resetBargeIn();
    flushPlayback();
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "abort_briefing" }));
    }
  }, [resetBargeIn, flushPlayback, wsRef]);

  const sendText = useCallback(
    (text: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !text.trim()) return;
      interruptBriefing();
      ws.send(JSON.stringify({ type: "text_input", text: text.trim() }));
    },
    [interruptBriefing, wsRef],
  );

  const relayIntegrationTokens = useCallback(async () => {
    await relayIntegrationTokensAfterConnect(wsRef.current, settingsRef.current);
  }, [wsRef]);

  const sendPttTurnEnd = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ptt_end" }));
    }
    micMutedRef.current = true;
    setPttCapturing(false);
  }, [wsRef, micMutedRef, setPttCapturing]);

  const consumeTurnCommitMeta = useCallback((): VoiceTurnCommitMeta => {
    const pending = pendingTurnCommitRef.current;
    pendingTurnCommitRef.current = null;
    if (pending) {
      return pending;
    }
    return {
      toolName: turnToolNameRef.current,
      toolSource: lastToolSourceRef.current,
      briefingSection: briefingSectionRef.current,
    };
  }, []);

  const setOnTurnComplete = useCallback(
    (handler: ((payload: ServerTurnCommitPayload) => void) | null) => {
      onTurnCompleteRef.current = handler;
    },
    [],
  );

  const setOnToolResult = useCallback(
    (handler: ((payload: VoiceToolResultPayload) => void) | null) => {
      onToolResultChainedRef.current = handler;
    },
    [],
  );

  const setOnToolRunning = useCallback(
    (handler: ((payload: VoiceToolRunningPayload) => void) | null) => {
      onToolRunningChainedRef.current = handler;
    },
    [],
  );

  const setOnBriefingOfferEvent = useCallback(
    (handler: ((event: BriefingOfferServerEvent) => void) | null) => {
      onBriefingOfferEventRef.current = handler;
    },
    [],
  );

  const sendJsonFrame = useCallback(
    (frame: Record<string, unknown>) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(frame));
      }
    },
    [wsRef],
  );

  const lastPendingDeleteSyncRef = useRef<{ ws: WebSocket | null; key: string }>({
    ws: null,
    key: "",
  });

  const sendPendingCalendarDeleteSync = useCallback(
    (draft: Record<string, unknown> | null) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const key = draft ? JSON.stringify(draft) : "";
      const cache = lastPendingDeleteSyncRef.current;
      if (cache.ws === ws && cache.key === key) return;
      cache.ws = ws;
      cache.key = key;
      ws.send(
        JSON.stringify({
          type: "pending_calendar_delete_sync",
          draft,
        }),
      );
    },
    [wsRef],
  );

  const startForPushToTalk = useCallback(async () => {
    // BriefingOffer asks before fetch — safe to run startup=1 on PTT warm.
    startMutedMicRef.current = true;
    setPttCapturing(false);
    await start();
  }, [start, setPttCapturing]);

  /** Muted land warm so the server can emit briefing_offer without the user speaking first. */
  const startForLandOffer = useCallback(async () => {
    startMutedMicRef.current = true;
    setPttCapturing(false);
    await start();
  }, [start, setPttCapturing]);

  return {
    isListening,
    isReconnecting,
    inputTranscript,
    outputTranscript,
    visualMetricsRef,
    pendingToolApproval,
    toolPhaseLabel,
    lastToolSource,
    error,
    errorActionId: currentErrorActionId,
    micAutostartSuppressed,
    briefingSection,
    start,
    stop,
    stopImmediate,
    dismissError,
    approveToolCall,
    denyToolCall,
    interruptBriefing,
    sendText,
    relayIntegrationTokens,
    isPttCapturing,
    startForPushToTalk,
    startForLandOffer,
    setMicCaptureEnabled,
    beginPttCaptureWarmup,
    sendPttTurnEnd,
    consumeTurnCommitMeta,
    setOnTurnComplete,
    setOnToolResult,
    setOnToolRunning,
    setOnBriefingOfferEvent,
    sendJsonFrame,
    sendPendingCalendarDeleteSync,
    voiceTurnTraces,
  };
}
