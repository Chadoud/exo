/**
 * Pure routing for JSON frames received over the voice WebSocket.
 * Side effects are delegated to {@link VoiceFrameRouterDeps} so frame handling is unit-testable.
 */

import { toast } from "sonner";
import type {
  ServerTurnCommitPayload,
  VoiceTurnCommitMeta,
} from "../features/assistant/chat/commitAssistantTurn";
import type { ErrorActionId } from "../utils/userGuidance";
import { errorActionId } from "../utils/userGuidance";
import { isFatalVoiceSessionError } from "../utils/voiceApiKeyError";
import { showQuotaToast } from "../utils/quotaToast";
import {
  VOICE_AUDIO_CONFIG_MESSAGE,
  VOICE_CONNECTION_WEAK_MESSAGE,
  VOICE_QUOTA_LIMIT_MESSAGE,
  VOICE_RECONNECT_ISSUE_MESSAGE,
  VOICE_RECONNECT_ISSUE_THRESHOLD,
  isFatalVoiceAudioConfigError,
} from "../utils/voiceSessionIssue";
import { looksLikeEchoOfRecentAssistant } from "../utils/voiceEchoGuard";
import {
  appendStreamingVoiceInputTranscript,
  isVoiceTranscriptNoisePlaceholder,
  VOICE_ASSISTANT_ECHO_LOOKBACK,
} from "../utils/voiceTranscriptQuality";
import type { StreamingAudioPlayer } from "../hooks/voiceAudio";
import {
  cancelDelayedTranscriptReset,
  scheduleDelayedTranscriptReset,
  TRANSCRIPT_COMMIT_QUIESCENCE_MS,
  TRANSCRIPT_RECONNECT_WAIT_MS,
  type TranscriptResetTimer,
} from "./voiceTranscriptCommit";
import type { BriefingOfferServerEvent } from "./briefingOfferTypes";
import { isBriefingSectionRecordOutcome } from "../features/assistant/chat/briefingOutcome";
import type { BriefingSectionRecordPayload } from "./briefingSectionRecord";

export interface VoiceTurnTraceEntry {
  commit_reason: string;
  stt_chunk_count: number;
  canonical_at_tool: string;
  canonical_at_turn_complete: string;
  tool_name?: string | null;
  tool_operation?: string | null;
  tool_ok?: boolean | null;
  tool_error?: string | null;
  stt_race?: boolean;
  enriched_summary?: string | null;
  enriched_start?: string | null;
  deferred_tool_reason?: string | null;
  user_drop_reason?: string | null;
  confirm_state?: string | null;
  title_source?: string | null;
}

/** Payload forwarded when Gemini finishes executing a Live tool (`tool_result`). */
export interface VoiceToolResultPayload {
  tool: string;
  callId: string;
  result: unknown;
}

/** Emitted when the server reports tools are executing (`tool_running`). */
export interface VoiceToolRunningPayload {
  tools: string[];
  planTaskId?: string;
  planGoal?: string;
}

/** Mutable session refs the frame router reads and updates. */
export interface VoiceFrameRouterRefs {
  outputTranscript: { current: string };
  recentAssistantLines: { current: string[] };
  isSpeaking: { current: boolean };
  bargeInActive: { current: boolean };
  bargeInPending: { current: boolean };
  bargeInFrameCount: { current: number };
  briefingActive: { current: boolean };
  briefingSection: { current: string | null };
  deferredStop: { current: boolean };
  stopped: { current: boolean };
  turnToolName: { current: string | null };
  lastToolSource: { current: string | null };
  pendingTurnCommit: { current: VoiceTurnCommitMeta | null };
  transcriptResetTimer: { current: TranscriptResetTimer };
  micPreRoll: { clear: () => void };
  wasGatingMic: { current: boolean };
  audioPlayer: { current: StreamingAudioPlayer | null };
  reconnectAttemptCount: { current: number };
}

/** React setters and imperative callbacks invoked by the router. */
export interface VoiceFrameRouterActions {
  setInputTranscript: (value: string | ((previous: string) => string)) => void;
  setOutputTranscript: (value: string | ((previous: string) => string)) => void;
  setBriefingSection: (section: string | null) => void;
  setIsReconnecting: (value: boolean) => void;
  setIsListening: (value: boolean) => void;
  setToolPhaseLabel: (label: string | null) => void;
  setPendingToolApproval: (
    value:
      | { tool: string; callId: string }
      | null
      | ((previous: { tool: string; callId: string } | null) => { tool: string; callId: string } | null),
  ) => void;
  setError: (message: string) => void;
  setCurrentErrorActionId: (id: ErrorActionId | undefined) => void;
  setMicAutostartSuppressed: (value: boolean) => void;
  assignToolSource: (source: string | null) => void;
  clearToolSource: () => void;
  stop: () => void;
  cancelReconnectTimer: () => void;
  resetTranscripts: () => void;
  clearEphemeralVoiceIssue: () => void;
}

export interface VoiceFrameRouterDeps {
  refs: VoiceFrameRouterRefs;
  actions: VoiceFrameRouterActions;
  alwaysApprovedTools: readonly string[];
  onToolRunning?: (payload: VoiceToolRunningPayload) => void;
  onToolResult?: (payload: VoiceToolResultPayload) => void;
  onTurnTrace?: (traces: VoiceTurnTraceEntry[]) => void;
  /** Fires when the backend finishes a voice turn — use for immediate chat commit. */
  onTurnComplete?: (payload: ServerTurnCommitPayload) => void;
  /** Startup BriefingOffer chrome — Offering / Loading / Error / clear. */
  onBriefingOfferEvent?: (event: BriefingOfferServerEvent) => void;
  /** Durable briefing section outcome (skip / abort / nothing) — no fetch payloads. */
  onBriefingSectionRecord?: (payload: BriefingSectionRecordPayload) => void;
  resolveAction?: (id: ErrorActionId) => (() => void) | undefined;
  /** When false, quota/connection toasts are suppressed (Exo uses inline banner). */
  shouldNotifyToast?: () => boolean;
  ws: WebSocket | null;
}

function emitBriefingOffer(
  deps: VoiceFrameRouterDeps,
  event: BriefingOfferServerEvent,
): void {
  deps.onBriefingOfferEvent?.(event);
}

/**
 * Route a parsed voice WebSocket JSON frame to the appropriate side effects.
 *
 * @param frame - Parsed JSON object from the backend.
 * @param deps - Session refs, setters, and optional tool callbacks.
 */
export function routeVoiceFrame(frame: Record<string, unknown>, deps: VoiceFrameRouterDeps): void {
  const type = frame.type as string;
  const { refs, actions, ws } = deps;

  if (type === "transcript_in") {
    const chunk = frame.text as string;
    if (isVoiceTranscriptNoisePlaceholder(chunk)) return;
    cancelDelayedTranscriptReset(refs.transcriptResetTimer);
    const assistantSoFar = refs.outputTranscript.current;
    if (
      looksLikeEchoOfRecentAssistant(
        chunk,
        assistantSoFar,
        refs.recentAssistantLines.current.slice(-VOICE_ASSISTANT_ECHO_LOOKBACK),
      )
    ) {
      return;
    }
    actions.setInputTranscript((previous) => {
      const candidate = appendStreamingVoiceInputTranscript(previous, chunk);
      const normalized = candidate.trim();
      if (
        normalized &&
        looksLikeEchoOfRecentAssistant(
          normalized,
          assistantSoFar,
          refs.recentAssistantLines.current.slice(-VOICE_ASSISTANT_ECHO_LOOKBACK),
        )
      ) {
        return previous;
      }
      return candidate;
    });
    return;
  }

  if (type === "transcript_user_full") {
    const full = typeof frame.text === "string" ? frame.text.trim() : "";
    if (!full) return;
    cancelDelayedTranscriptReset(refs.transcriptResetTimer);
    actions.setInputTranscript(full);
    return;
  }

  if (type === "turn_trace") {
    const raw = frame.traces;
    if (Array.isArray(raw) && deps.onTurnTrace) {
      deps.onTurnTrace(raw as VoiceTurnTraceEntry[]);
    }
    return;
  }

  if (type === "transcript_out") {
    const chunk = frame.text as string;
    refs.outputTranscript.current += chunk;
    actions.setOutputTranscript((previous) => previous + chunk);
    return;
  }

  if (type === "audio_out") {
    refs.audioPlayer.current?.enqueue(frame.data as string);
    return;
  }

  if (type === "speaking_start") {
    refs.isSpeaking.current = true;
    refs.bargeInActive.current = false;
    refs.bargeInPending.current = false;
    refs.bargeInFrameCount.current = 0;
    refs.outputTranscript.current = "";
    return;
  }

  if (type === "speaking_end") {
    refs.isSpeaking.current = false;
    return;
  }

  if (type === "interrupted") {
    refs.isSpeaking.current = false;
    refs.bargeInPending.current = false;
    refs.audioPlayer.current?.flush();
    return;
  }

  if (type === "briefing_offer") {
    emitBriefingOffer(deps, { type: "briefing_offer" });
    return;
  }

  if (type === "briefing_loading") {
    emitBriefingOffer(deps, { type: "briefing_loading" });
    return;
  }

  if (type === "briefing_offer_error") {
    const message =
      typeof frame.message === "string" && frame.message.trim()
        ? frame.message.trim()
        : "Couldn't start today's briefing.";
    emitBriefingOffer(deps, { type: "briefing_offer_error", message });
    return;
  }

  if (type === "briefing_offer_clear") {
    emitBriefingOffer(deps, { type: "briefing_offer_clear" });
    return;
  }

  if (type === "briefing_section_record") {
    const section = typeof frame.section === "string" ? frame.section.trim() : "";
    const outcome = typeof frame.outcome === "string" ? frame.outcome.trim() : "";
    if (section && isBriefingSectionRecordOutcome(outcome)) {
      deps.onBriefingSectionRecord?.({ kind: "section", section, outcome });
    }
    return;
  }

  if (type === "briefing_tasks_honesty") {
    deps.onBriefingSectionRecord?.({ kind: "tasks_honesty" });
    return;
  }

  if (type === "briefing_progress") {
    const section = typeof frame.section === "string" ? frame.section : null;
    actions.setBriefingSection(section);
    if (section) {
      emitBriefingOffer(deps, { type: "briefing_running" });
    }
    if (!section) {
      refs.briefingActive.current = false;
      actions.setToolPhaseLabel(null);
      if (refs.deferredStop.current) {
        refs.deferredStop.current = false;
        actions.stop();
      }
    }
    return;
  }

  if (type === "turn_complete") {
    const toolName = refs.turnToolName.current;
    const serverUserText = typeof frame.user_text === "string" ? frame.user_text : "";
    const serverAssistantText =
      typeof frame.assistant_text === "string"
        ? frame.assistant_text
        : refs.outputTranscript.current.trim();
    const userCommitted = frame.user_committed === true;
    const dropReason =
      typeof frame.drop_reason === "string" ? frame.drop_reason : null;
    const userTextRaw =
      typeof frame.user_text_raw === "string" ? frame.user_text_raw : null;
    refs.pendingTurnCommit.current = {
      toolName,
      toolSource: toolName ? refs.lastToolSource.current : null,
      briefingSection: refs.briefingSection.current,
      serverTurn: {
        userText: serverUserText,
        assistantText: serverAssistantText,
        userCommitted,
        dropReason,
        userTextRaw,
      },
    };
    deps.onTurnComplete?.({
      userText: serverUserText,
      assistantText: serverAssistantText,
      userCommitted,
      dropReason,
      userTextRaw,
    });
    refs.turnToolName.current = null;
    actions.clearToolSource();
    if (!refs.audioPlayer.current?.isOutputActive(0)) {
      refs.audioPlayer.current?.resetCursor();
    }
    refs.bargeInActive.current = false;
    refs.bargeInPending.current = false;
    refs.bargeInFrameCount.current = 0;
    const completedAssistant = refs.outputTranscript.current.trim();
    if (completedAssistant) {
      refs.recentAssistantLines.current = [
        ...refs.recentAssistantLines.current,
        completedAssistant,
      ].slice(-VOICE_ASSISTANT_ECHO_LOOKBACK);
    }
    scheduleDelayedTranscriptReset(
      refs.transcriptResetTimer,
      TRANSCRIPT_COMMIT_QUIESCENCE_MS,
      actions.resetTranscripts,
    );
    if (refs.briefingActive.current && refs.deferredStop.current) {
      refs.briefingActive.current = false;
      refs.deferredStop.current = false;
      actions.stop();
    }
    return;
  }

  if (type === "connection_weak") {
    actions.setIsReconnecting(true);
    actions.setError(VOICE_CONNECTION_WEAK_MESSAGE);
    if (deps.shouldNotifyToast?.() ?? true) {
      toast.message("Weak connection", {
        description: "Reconnecting your voice session — this may take a moment.",
        duration: 4_000,
      });
    }
    return;
  }

  if (type === "reconnecting") {
    actions.setIsReconnecting(true);
    refs.reconnectAttemptCount.current += 1;
    if (refs.reconnectAttemptCount.current >= VOICE_RECONNECT_ISSUE_THRESHOLD) {
      actions.setError(VOICE_RECONNECT_ISSUE_MESSAGE);
    }
    refs.isSpeaking.current = false;
    refs.bargeInActive.current = false;
    refs.bargeInPending.current = false;
    refs.bargeInFrameCount.current = 0;
    scheduleDelayedTranscriptReset(
      refs.transcriptResetTimer,
      TRANSCRIPT_RECONNECT_WAIT_MS,
      actions.resetTranscripts,
    );
    refs.micPreRoll.clear();
    refs.wasGatingMic.current = false;
    return;
  }

  if (type === "quota_hint") {
    actions.setError(VOICE_QUOTA_LIMIT_MESSAGE);
    actions.setCurrentErrorActionId("settings:ai-provider");
    if (deps.shouldNotifyToast?.() ?? true) {
      showQuotaToast({
        onAddApiKey: deps.resolveAction?.("settings:ai-provider"),
      });
    }
    return;
  }

  if (type === "startup_routine_running") {
    refs.briefingActive.current = true;
    actions.setToolPhaseLabel("Running your briefing…");
    emitBriefingOffer(deps, { type: "briefing_running" });
    return;
  }

  if (type === "session_start") {
    actions.setIsReconnecting(false);
    actions.setIsListening(true);
    refs.reconnectAttemptCount.current = 0;
    actions.clearEphemeralVoiceIssue();
    actions.setToolPhaseLabel(null);
    actions.setInputTranscript("");
    actions.setOutputTranscript("");
    refs.outputTranscript.current = "";
    refs.micPreRoll.clear();
    refs.wasGatingMic.current = false;
    return;
  }

  if (type === "tool_running") {
    const raw = frame.tools;
    const names = Array.isArray(raw) ? raw.map((x) => String(x)).filter(Boolean) : [];
    actions.setToolPhaseLabel(names.length ? `Working: ${names.join(", ")}` : "Working…");
    if (names.length > 0) {
      const source = (frame as { tool_source?: string }).tool_source ?? names[0];
      refs.turnToolName.current = names[0] ?? null;
      actions.assignToolSource(source);
    }
    const planTaskId =
      typeof (frame as { plan_task_id?: string }).plan_task_id === "string"
        ? (frame as { plan_task_id: string }).plan_task_id
        : undefined;
    const planGoal =
      typeof (frame as { plan_goal?: string }).plan_goal === "string"
        ? (frame as { plan_goal: string }).plan_goal
        : undefined;
    if (names.length > 0 && deps.onToolRunning) {
      deps.onToolRunning({ tools: names, planTaskId, planGoal });
    }
    return;
  }

  if (type === "tool_idle") {
    actions.setToolPhaseLabel(null);
    return;
  }

  if (type === "tool_approval_required") {
    const callId = String(frame.call_id ?? "");
    const tool = String(frame.tool ?? "");
    if (callId && tool) {
      if (deps.alwaysApprovedTools.includes(tool)) {
        ws?.send(JSON.stringify({ type: "tool_approved", call_id: callId, scope: "once" }));
      } else {
        actions.setPendingToolApproval({ callId, tool });
      }
    }
    return;
  }

  if (type === "tool_result") {
    const cid = String(frame.call_id ?? "");
    actions.setPendingToolApproval((previous) =>
      previous && previous.callId === cid ? null : previous,
    );
    const toolName = typeof frame.tool === "string" ? frame.tool.trim() : "";
    if (toolName && deps.onToolResult) {
      deps.onToolResult({ tool: toolName, callId: cid, result: frame.result });
    }
    return;
  }

  if (type === "done") {
    actions.setBriefingSection(null);
    return;
  }

  if (type === "voice_session_end") {
    refs.stopped.current = true;
    actions.stop();
    return;
  }

  if (type === "error") {
    const rawMsg = (frame.message as string) || "Voice session error";
    const msg = isFatalVoiceAudioConfigError(rawMsg) ? VOICE_AUDIO_CONFIG_MESSAGE : rawMsg;
    const isFatal = isFatalVoiceSessionError(msg) || isFatalVoiceSessionError(rawMsg);
    actions.setError(msg);
    actions.setCurrentErrorActionId(errorActionId(new Error(msg)));
    if (isFatal) {
      refs.stopped.current = true;
      actions.setMicAutostartSuppressed(true);
      actions.cancelReconnectTimer();
      actions.setIsListening(false);
      actions.setIsReconnecting(false);
      if (isFatalVoiceAudioConfigError(rawMsg) && (deps.shouldNotifyToast?.() ?? true)) {
        toast.error("Voice unavailable", {
          description: VOICE_AUDIO_CONFIG_MESSAGE,
          duration: 8_000,
        });
      }
    }
  }
}

/**
 * Parse a WebSocket text payload into a frame object, or null when invalid.
 */
export function parseVoiceFramePayload(data: string): Record<string, unknown> | null {
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}
