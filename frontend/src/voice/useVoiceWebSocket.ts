/**
 * WebSocket lifecycle for the voice session: open, session priming, reconnect, frame dispatch.
 */

import { useCallback, useRef, type RefObject } from "react";
import { BACKEND_HOST, BACKEND_PORT } from "../constants";
import type { AppSettings } from "../types/settings";
import { sendVoiceWsAppAuth } from "./voiceWsAuth";
import { primeVoiceSessionFromRenderer } from "./voiceSessionPrime";
import { parseVoiceFramePayload, routeVoiceFrame, type VoiceFrameRouterDeps } from "./voiceFrameRouter";
import { VOICE_WS_PAYMENT_REQUIRED } from "./voiceWsClose";

const WS_URL = `ws://${BACKEND_HOST}:${BACKEND_PORT}/ws/voice`;

/** Seconds to wait before attempting a frontend-side WS reconnect. */
const WS_RECONNECT_DELAY_MS = 2_000;

interface UseVoiceWebSocketOptions {
  memoryEnabledRef: RefObject<boolean>;
  skipStartupBriefingRef: RefObject<boolean>;
  startupFiredRef: RefObject<boolean>;
  voiceSessionIdRef: RefObject<string>;
  stoppedRef: RefObject<boolean>;
  tokensRelayedRef: RefObject<boolean>;
  frameRouterDepsRef: RefObject<VoiceFrameRouterDeps | null>;
  setIsListening: (value: boolean) => void;
  setIsReconnecting: (value: boolean) => void;
  setError?: (message: string) => void;
  onWsClose?: () => void;
  /** Called after the WebSocket opens and the worklet node is ready to forward PCM. */
  attachPcmForwarder?: (ws: WebSocket) => void;
  /** Active settings for relaying chat provider credentials on connect. */
  settingsRef?: RefObject<AppSettings | undefined>;
}

interface UseVoiceWebSocketReturn {
  wsRef: RefObject<WebSocket | null>;
  openWebSocket: () => Promise<void>;
  closeWebSocket: (sendEmptyFrame?: boolean) => void;
  cancelReconnectTimer: () => void;
}

/**
 * Manage the /ws/voice WebSocket: URL params (memory, startup, session_id),
 * app_auth frame on open, main-process session priming, auto-reconnect, and JSON frame routing.
 */
export function useVoiceWebSocket(options: UseVoiceWebSocketOptions): UseVoiceWebSocketReturn {
  const {
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
    onWsClose,
    attachPcmForwarder,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openWebSocketRef = useRef<() => Promise<void>>(async () => {});

  const cancelReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const closeWebSocket = useCallback((sendEmptyFrame = true) => {
    cancelReconnectTimer();
    const ws = wsRef.current;
    if (!ws) return;
    if (sendEmptyFrame && ws.readyState === WebSocket.OPEN) {
      ws.send(new ArrayBuffer(0));
    }
    ws.close();
    wsRef.current = null;
  }, [cancelReconnectTimer]);

  const openWebSocket = useCallback(async () => {
    const memParam = memoryEnabledRef.current ? "1" : "0";
    const startupParam =
      skipStartupBriefingRef.current || startupFiredRef.current ? "0" : "1";
    if (!skipStartupBriefingRef.current) {
      startupFiredRef.current = true;
    }
    skipStartupBriefingRef.current = false;

    const sessionId = voiceSessionIdRef.current || "";
    const sessionParam = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : "";

    const prime = await primeVoiceSessionFromRenderer(sessionId, settingsRef?.current);
    if (!prime.ok) {
      setIsListening(false);
      setIsReconnecting(false);
      setError?.(
        prime.reason === "session_id_required"
          ? "Voice session failed to start. Try the microphone again."
          : "Couldn't prepare the voice session. Check Settings → AI agents → AI provider, then retry.",
      );
      return;
    }

    const autonomousParam = settingsRef?.current?.autonomousMode ? "1" : "0";

    const ws = new WebSocket(
      `${WS_URL}?memory=${memParam}&startup=${startupParam}&autonomous_mode=${autonomousParam}${sessionParam}`,
    );
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    tokensRelayedRef.current = false;

    ws.onopen = () => {
      void (async () => {
        const auth = await sendVoiceWsAppAuth(ws);
        if (!auth.ok) {
          setIsListening(false);
          setIsReconnecting(false);
          setError?.(
            "Couldn't authorize the voice connection. Wait for Exo to finish starting, then retry.",
          );
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          return;
        }
        tokensRelayedRef.current = true;
        setIsListening(true);
        setIsReconnecting(false);
      })();
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const frame = parseVoiceFramePayload(event.data);
      if (!frame) return;
      const deps = frameRouterDepsRef.current;
      if (!deps) return;
      routeVoiceFrame(frame, { ...deps, ws });
    };

    ws.onerror = () => {
      // Errors are followed by onclose — handle teardown / reconnect there
    };

    ws.onclose = (event: CloseEvent) => {
      wsRef.current = null;
      setIsListening(false);
      onWsClose?.();

      if (stoppedRef.current) return;
      if (event?.code === VOICE_WS_PAYMENT_REQUIRED) {
        stoppedRef.current = true;
        setIsReconnecting(false);
        return;
      }

      setIsReconnecting(true);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!stoppedRef.current) {
          void openWebSocketRef.current();
        }
      }, WS_RECONNECT_DELAY_MS);
    };

    attachPcmForwarder?.(ws);
  }, [
    attachPcmForwarder,
    frameRouterDepsRef,
    memoryEnabledRef,
    onWsClose,
    setIsListening,
    setIsReconnecting,
    setError,
    skipStartupBriefingRef,
    startupFiredRef,
    stoppedRef,
    tokensRelayedRef,
    settingsRef,
    voiceSessionIdRef,
  ]);

  openWebSocketRef.current = openWebSocket;

  return {
    wsRef,
    openWebSocket,
    closeWebSocket,
    cancelReconnectTimer,
  };
}
