/**
 * @vitest-environment jsdom
 */
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../types/settings";
import type { UseVoiceSessionReturn } from "./useVoiceSession";
import { usePushToTalk } from "./usePushToTalk";
import { DEFAULT_APP_SETTINGS } from "../settings/appSettingsHydration";
import { createEmptyVoiceVisualMetrics } from "../voice/voiceVisualMetrics";

const assertVoiceBackendReady = vi.fn(
  async (_settings: unknown, _options: unknown) => undefined,
);
vi.mock("../voice/ensureVoiceBackendReady", () => ({
  assertVoiceBackendReady: (settings: unknown, options: unknown) =>
    assertVoiceBackendReady(settings, options),
}));

type CapturedCallbacks = {
  onStartCapture?: () => Promise<void>;
  onEnterLockedMode?: () => Promise<void>;
};

let capturedCallbacks: CapturedCallbacks = {};

vi.mock("../utils/pushToTalkController", () => ({
  createPushToTalkController: (options: {
    callbacks: CapturedCallbacks;
  }) => {
    capturedCallbacks = options.callbacks;
    return {
      state: "idle" as const,
      handleKeyDown: vi.fn(),
      handleKeyUp: vi.fn(),
      cancel: vi.fn(),
    };
  },
}));

function createMockVoice(
  overrides: Partial<UseVoiceSessionReturn> = {},
): UseVoiceSessionReturn {
  return {
    isListening: false,
    isReconnecting: false,
    inputTranscript: "",
    outputTranscript: "",
    visualMetricsRef: { current: createEmptyVoiceVisualMetrics() },
    pendingToolApproval: null,
    toolPhaseLabel: null,
    lastToolSource: null,
    error: null,
    errorActionId: undefined,
    micAutostartSuppressed: false,
    briefingSection: null,
    isPttCapturing: false,
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    stopImmediate: vi.fn(),
    dismissError: vi.fn(),
    approveToolCall: vi.fn(),
    denyToolCall: vi.fn(),
    interruptBriefing: vi.fn(),
    sendText: vi.fn(),
    relayIntegrationTokens: vi.fn(async () => undefined),
    startForPushToTalk: vi.fn(async () => undefined),
    startForLandOffer: vi.fn(async () => undefined),
    setMicCaptureEnabled: vi.fn(),
    beginPttCaptureWarmup: vi.fn(),
    sendPttTurnEnd: vi.fn(),
    consumeTurnCommitMeta: vi.fn(() => ({
      toolName: null,
      toolSource: null,
      briefingSection: null,
    })),
    setOnTurnComplete: vi.fn(),
    setOnToolResult: vi.fn(),
    setOnToolRunning: vi.fn(),
    setOnBriefingOfferEvent: vi.fn(),
    sendJsonFrame: vi.fn(),
    sendPendingCalendarDeleteSync: vi.fn(),
    voiceTurnTraces: [],
    ...overrides,
  };
}

function pttSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    voiceInteractionMode: "pushToTalk",
    pttShortcut: {
      ...DEFAULT_APP_SETTINGS.pttShortcut,
      captureInApp: false,
    },
    ...overrides,
  };
}

describe("usePushToTalk", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedCallbacks = {};
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("does not warm the voice session on mount when backend is online", async () => {
    const voice = createMockVoice();

    function Probe() {
      usePushToTalk({
        settings: pttSettings(),
        voice,
        backendOnline: true,
      });
      return null;
    }

    await act(async () => {
      root.render(createElement(Probe));
    });

    expect(voice.startForPushToTalk).not.toHaveBeenCalled();
    expect(assertVoiceBackendReady).not.toHaveBeenCalled();
  });

  it("warms the voice session via assertVoiceBackendReady and startForPushToTalk on capture", async () => {
    const voice = createMockVoice();

    function Probe() {
      usePushToTalk({
        settings: pttSettings(),
        voice,
        backendOnline: true,
      });
      return null;
    }

    await act(async () => {
      root.render(createElement(Probe));
    });

    await act(async () => {
      await capturedCallbacks.onStartCapture?.();
    });

    expect(voice.beginPttCaptureWarmup).toHaveBeenCalledTimes(1);
    expect(assertVoiceBackendReady).toHaveBeenCalledWith(
      expect.objectContaining({ voiceInteractionMode: "pushToTalk" }),
      { backendOnline: true },
    );
    expect(voice.startForPushToTalk).toHaveBeenCalled();
    expect(voice.setMicCaptureEnabled).toHaveBeenCalledWith(true);
  });

  it("skips warm session when backend is offline", async () => {
    const voice = createMockVoice();

    function Probe() {
      usePushToTalk({
        settings: pttSettings(),
        voice,
        backendOnline: false,
      });
      return null;
    }

    await act(async () => {
      root.render(createElement(Probe));
    });

    await act(async () => {
      await capturedCallbacks.onStartCapture?.();
    });

    expect(assertVoiceBackendReady).not.toHaveBeenCalled();
    expect(voice.startForPushToTalk).not.toHaveBeenCalled();
  });

  it("does not show overlay when mode is conversation", async () => {
    const voice = createMockVoice({ isPttCapturing: true });
    let showOverlay = false;

    function Probe() {
      const result = usePushToTalk({
        settings: { ...pttSettings(), voiceInteractionMode: "conversation" },
        voice,
        backendOnline: true,
      });
      // eslint-disable-next-line react-hooks/globals -- intentional test probe
      showOverlay = result.showOverlay;
      return null;
    }

    await act(async () => {
      root.render(createElement(Probe));
    });

    expect(showOverlay).toBe(false);
  });
});
