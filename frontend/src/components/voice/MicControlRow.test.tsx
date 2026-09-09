// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import { DEFAULT_APP_SETTINGS } from "../../settings/appSettingsHydration";
import type { AppSettings } from "../../types/settings";
import type { UseVoiceSessionReturn } from "../../hooks/useVoiceSession";
import type { VoiceBackendReadiness } from "../../hooks/useVoiceBackendReady";
import type { VoiceReadinessSnapshot } from "../../voice/voiceReadiness";
import { createEmptyVoiceVisualMetrics } from "../../voice/voiceVisualMetrics";
import { MicControlRow } from "./MicControlRow";

function mockVoice(overrides: Partial<UseVoiceSessionReturn> = {}): UseVoiceSessionReturn {
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
    setOnBriefingSectionRecord: vi.fn(),
    sendJsonFrame: vi.fn(),
    sendPendingCalendarDeleteSync: vi.fn(),
    voiceTurnTraces: [],
    ...overrides,
  };
}

function readiness(snapshot: VoiceReadinessSnapshot): VoiceBackendReadiness {
  return { ...snapshot, refresh: vi.fn() };
}

describe("MicControlRow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const renderRow = async (
    layout: "exo" | "composer",
    snapshot: VoiceReadinessSnapshot,
    voice: UseVoiceSessionReturn = mockVoice(),
    settings: AppSettings = DEFAULT_APP_SETTINGS,
  ) => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MicControlRow
            voice={voice}
            voiceReadiness={readiness(snapshot)}
            settings={settings}
            onSettingsPatch={vi.fn()}
            layout={layout}
          />
        </I18nProvider>,
      );
    });
    return voice;
  };

  it("disables rail and composer start while checking", async () => {
    await renderRow("exo", { state: "checking" });
    const railMic = container.querySelector("button[aria-busy='true']");
    expect(railMic).not.toBeNull();
    expect((railMic as HTMLButtonElement).disabled).toBe(true);

    await renderRow("composer", { state: "checking" });
    const composerMic = container.querySelector("button[aria-busy='true']");
    expect(composerMic).not.toBeNull();
    expect((composerMic as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts from both surfaces when ready", async () => {
    const railVoice = await renderRow("exo", { state: "ready", model: "gemini-live" });
    const railMic = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("MIC"),
    );
    await act(async () => {
      railMic?.click();
    });
    expect(railVoice.start).toHaveBeenCalledOnce();

    const composerVoice = await renderRow("composer", { state: "ready", model: "gemini-live" });
    const composerMic = container.querySelector<HTMLButtonElement>('button[aria-label="Start voice input"]');
    await act(async () => {
      composerMic?.click();
    });
    expect(composerVoice.start).toHaveBeenCalledOnce();
  });

  it("shows a gear warning only when PTT hides the mic entry", async () => {
    await renderRow("composer", { state: "missing_key" });
    expect(container.querySelector(".bg-warning")).toBeNull();

    await renderRow(
      "composer",
      { state: "missing_key" },
      mockVoice(),
      { ...DEFAULT_APP_SETTINGS, voiceInteractionMode: "pushToTalk" },
    );
    const gear = container.querySelector('[aria-label="Microphone settings"]');
    expect(gear?.querySelector(".bg-warning")).not.toBeNull();
  });

  it("keeps restart contextual to error or reconnecting", async () => {
    await renderRow("composer", { state: "ready", model: "gemini-live" });
    expect(container.querySelector('[aria-label="Restart microphone"]')).toBeNull();

    await renderRow(
      "composer",
      { state: "ready", model: "gemini-live" },
      mockVoice({ error: "Mic failed", isListening: true }),
    );
    expect(container.querySelector('[aria-label="Restart microphone"]')).not.toBeNull();
  });

  it("shows the runtime issue banner under the composer icons", async () => {
    await renderRow(
      "composer",
      { state: "ready", model: "gemini-live" },
      mockVoice({ error: "quota exceeded", isListening: true }),
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toMatch(/quota/i);
  });
});
