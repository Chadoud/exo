import { describe, expect, it, vi, beforeEach } from "vitest";
import type { VoiceFrameRouterActions, VoiceFrameRouterDeps, VoiceFrameRouterRefs } from "./voiceFrameRouter";
import { routeVoiceFrame } from "./voiceFrameRouter";

function createMockRefs(overrides: Partial<VoiceFrameRouterRefs> = {}): VoiceFrameRouterRefs {
  return {
    outputTranscript: { current: "" },
    recentAssistantLines: { current: [] },
    isSpeaking: { current: false },
    bargeInActive: { current: false },
    bargeInPending: { current: false },
    bargeInFrameCount: { current: 0 },
    briefingActive: { current: false },
    briefingSection: { current: null },
    deferredStop: { current: false },
    stopped: { current: false },
    turnToolName: { current: null },
    lastToolSource: { current: null },
    pendingTurnCommit: { current: null },
    transcriptResetTimer: { current: null },
    micPreRoll: { clear: vi.fn() },
    wasGatingMic: { current: false },
    audioPlayer: { current: null },
    reconnectAttemptCount: { current: 0 },
    ...overrides,
  };
}

function createMockActions(): VoiceFrameRouterActions & {
  [K in keyof VoiceFrameRouterActions]: ReturnType<typeof vi.fn>;
} {
  return {
    setInputTranscript: vi.fn(),
    setOutputTranscript: vi.fn(),
    setBriefingSection: vi.fn(),
    setIsReconnecting: vi.fn(),
    setIsListening: vi.fn(),
    setToolPhaseLabel: vi.fn(),
    setPendingToolApproval: vi.fn(),
    setError: vi.fn(),
    setCurrentErrorActionId: vi.fn(),
    setMicAutostartSuppressed: vi.fn(),
    assignToolSource: vi.fn(),
    clearToolSource: vi.fn(),
    stop: vi.fn(),
    cancelReconnectTimer: vi.fn(),
    resetTranscripts: vi.fn(),
    clearEphemeralVoiceIssue: vi.fn(),
  };
}

function createDeps(
  overrides: Partial<VoiceFrameRouterDeps> & {
    refs?: Partial<VoiceFrameRouterRefs>;
    actions?: ReturnType<typeof createMockActions>;
  } = {},
): VoiceFrameRouterDeps {
  return {
    refs: createMockRefs(overrides.refs),
    actions: overrides.actions ?? createMockActions(),
    alwaysApprovedTools: [],
    ws: null,
    ...overrides,
  };
}

describe("routeVoiceFrame", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("appends transcript_out chunks and updates the output ref", () => {
    const refs = createMockRefs();
    const actions = createMockActions();
    const deps = createDeps({ refs, actions });

    routeVoiceFrame({ type: "transcript_out", text: "Hello" }, deps);

    expect(refs.outputTranscript.current).toBe("Hello");
    expect(actions.setOutputTranscript).toHaveBeenCalledTimes(1);
  });

  it("schedules delayed transcript reset on reconnecting", () => {
    vi.useFakeTimers();
    const refs = createMockRefs({ outputTranscript: { current: "partial" } });
    const actions = createMockActions();
    const deps = createDeps({ refs, actions });

    routeVoiceFrame({ type: "reconnecting" }, deps);

    expect(actions.setIsReconnecting).toHaveBeenCalledWith(true);
    expect(actions.resetTranscripts).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(actions.resetTranscripts).toHaveBeenCalledTimes(1);
    expect(refs.micPreRoll.clear).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("sets canonical transcript from transcript_user_full", () => {
    const actions = createMockActions();
    const deps = createDeps({ actions });

    routeVoiceFrame({ type: "transcript_user_full", text: "Crée un événement demain" }, deps);

    expect(actions.setInputTranscript).toHaveBeenCalledWith("Crée un événement demain");
  });

  it("auto-approves whitelisted tools without opening the modal", () => {
    const send = vi.fn();
    const ws = { send } as unknown as WebSocket;
    const actions = createMockActions();
    const deps = createDeps({
      actions,
      ws,
      alwaysApprovedTools: ["screen_capture"],
    });

    routeVoiceFrame(
      { type: "tool_approval_required", call_id: "abc", tool: "screen_capture" },
      deps,
    );

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ type: "tool_approved", call_id: "abc", scope: "once" }),
    );
    expect(actions.setPendingToolApproval).not.toHaveBeenCalled();
  });

  it("queues approval for non-whitelisted tools", () => {
    const actions = createMockActions();
    const deps = createDeps({ actions });

    routeVoiceFrame(
      { type: "tool_approval_required", call_id: "abc", tool: "code_runner" },
      deps,
    );

    expect(actions.setPendingToolApproval).toHaveBeenCalledWith({
      callId: "abc",
      tool: "code_runner",
    });
  });

  it("invokes onToolResult for tool_result frames", () => {
    const onToolResult = vi.fn();
    const actions = createMockActions();
    const deps = createDeps({ actions, onToolResult });

    routeVoiceFrame(
      { type: "tool_result", call_id: "1", tool: "start_local_file_sort", result: { ok: true } },
      deps,
    );

    expect(onToolResult).toHaveBeenCalledWith({
      tool: "start_local_file_sort",
      callId: "1",
      result: { ok: true },
    });
  });

  it("stores server-authoritative turn payload on turn_complete", () => {
    const onTurnComplete = vi.fn();
    const refs = createMockRefs({
      outputTranscript: { current: "local partial" },
    });
    const actions = createMockActions();
    const deps = createDeps({ refs, actions, onTurnComplete });

    routeVoiceFrame(
      {
        type: "turn_complete",
        user_text: "midi",
        assistant_text: "C'est noté pour midi.",
        user_committed: true,
        drop_reason: null,
      },
      deps,
    );

    expect(refs.pendingTurnCommit.current?.serverTurn).toEqual({
      userText: "midi",
      assistantText: "C'est noté pour midi.",
      userCommitted: true,
      dropReason: null,
      userTextRaw: null,
    });
    expect(onTurnComplete).toHaveBeenCalledWith({
      userText: "midi",
      assistantText: "C'est noté pour midi.",
      userCommitted: true,
      dropReason: null,
      userTextRaw: null,
    });
  });

  it("stops the session on voice_session_end", () => {
    const refs = createMockRefs();
    const actions = createMockActions();
    const deps = createDeps({ refs, actions });

    routeVoiceFrame({ type: "voice_session_end" }, deps);

    expect(refs.stopped.current).toBe(true);
    expect(actions.stop).toHaveBeenCalled();
  });

  it("marks fatal API key errors and suppresses reconnect", () => {
    const refs = createMockRefs();
    const actions = createMockActions();
    const deps = createDeps({ refs, actions });

    routeVoiceFrame(
      { type: "error", message: "API key not valid. Please pass a valid API key." },
      deps,
    );

    expect(actions.setError).toHaveBeenCalled();
    expect(refs.stopped.current).toBe(true);
    expect(actions.setMicAutostartSuppressed).toHaveBeenCalledWith(true);
    expect(actions.cancelReconnectTimer).toHaveBeenCalled();
  });

  it("sets inline quota error on quota_hint and skips toast when suppressed", () => {
    const actions = createMockActions();
    const deps = createDeps({
      actions,
      shouldNotifyToast: () => false,
    });

    routeVoiceFrame({ type: "quota_hint", provider: "gemini", reason: "free_tier" }, deps);

    expect(actions.setError).toHaveBeenCalledWith(
      "Free Gemini API limit reached. Voice may not stay connected until you add a paid API key.",
    );
    expect(actions.setCurrentErrorActionId).toHaveBeenCalledWith("settings:ai-provider");
  });

  it("surfaces reconnect issue after repeated reconnecting frames", () => {
    const refs = createMockRefs();
    const actions = createMockActions();
    const deps = createDeps({ refs, actions });

    routeVoiceFrame({ type: "reconnecting", delay_s: 2 }, deps);
    routeVoiceFrame({ type: "reconnecting", delay_s: 2 }, deps);
    routeVoiceFrame({ type: "reconnecting", delay_s: 2 }, deps);

    expect(actions.setError).toHaveBeenCalledWith(
      "Voice keeps disconnecting. Check your network, or turn the mic off and on.",
    );
  });

  it("clears ephemeral issues on session_start", () => {
    const refs = createMockRefs();
    const actions = createMockActions();
    const deps = createDeps({ refs, actions });

    routeVoiceFrame({ type: "session_start", model: "gemini" }, deps);

    expect(refs.reconnectAttemptCount.current).toBe(0);
    expect(actions.clearEphemeralVoiceIssue).toHaveBeenCalled();
  });

  it("routes briefing offer frames to onBriefingOfferEvent", () => {
    const onBriefingOfferEvent = vi.fn();
    const deps = createDeps({ onBriefingOfferEvent });

    routeVoiceFrame({ type: "briefing_offer" }, deps);
    expect(onBriefingOfferEvent).toHaveBeenCalledWith({ type: "briefing_offer" });

    routeVoiceFrame({ type: "briefing_loading" }, deps);
    expect(onBriefingOfferEvent).toHaveBeenCalledWith({ type: "briefing_loading" });

    routeVoiceFrame({ type: "briefing_offer_error", message: "Offline" }, deps);
    expect(onBriefingOfferEvent).toHaveBeenCalledWith({
      type: "briefing_offer_error",
      message: "Offline",
    });

    routeVoiceFrame({ type: "briefing_offer_clear" }, deps);
    expect(onBriefingOfferEvent).toHaveBeenCalledWith({ type: "briefing_offer_clear" });
  });

  it("marks briefing running on startup_routine_running and section progress", () => {
    const onBriefingOfferEvent = vi.fn();
    const refs = createMockRefs();
    const actions = createMockActions();
    const deps = createDeps({ refs, actions, onBriefingOfferEvent });

    routeVoiceFrame({ type: "startup_routine_running" }, deps);
    expect(refs.briefingActive.current).toBe(true);
    expect(actions.setToolPhaseLabel).toHaveBeenCalledWith("Running your briefing…");
    expect(onBriefingOfferEvent).toHaveBeenCalledWith({ type: "briefing_running" });

    routeVoiceFrame({ type: "briefing_progress", section: "news" }, deps);
    expect(actions.setBriefingSection).toHaveBeenCalledWith("news");
    expect(onBriefingOfferEvent).toHaveBeenCalledWith({ type: "briefing_running" });
  });
});
