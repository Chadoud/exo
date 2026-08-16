/**
 * Debug snapshot export for the assistant chat.
 *
 * Assembles a structured JSON payload containing everything needed to
 * diagnose why the model may lose context between turns:
 *   - Current conversation messages (full text)
 *   - Last 5 outbound /assistant/chat payloads (exact messages array sent to LLM)
 *   - Settings snapshot (API key redacted)
 *   - Memory block metadata
 *   - Voice session state
 *
 * Schema version is bumped when breaking changes are made to the payload shape.
 * v2: settings snapshot uses `chatModel` (Assistant chat) instead of legacy `model`.
 */

import type { AppSettings } from "../../../types/settings";
import type { Conversation, ConversationMessage } from "../../../hooks/useConversations";
import type { OutboundChatRecord } from "./AssistantChatPanelCore";
import type { VoiceTurnTraceEntry } from "../../../voice/voiceFrameRouter";
import type { DiagnosticLogEntry, ExecutionTraceEntry } from "./assistantExecutionTrace";
import { getDiagnosticLogSnapshot, getExecutionTraceSnapshot, redactDiagnosticDetail } from "./assistantExecutionTrace";

const SCHEMA_VERSION = 6;

// ── Sanitization ──────────────────────────────────────────────────────────────

interface SanitizedSettings {
  /** Model used for Assistant text chat (Gemini slug or Ollama tag); must match `aiProvider`. */
  chatModel: string;
  aiProvider: string;
  assistantToolsEnabled: boolean;
  assistantAgentEnabled: boolean;
  assistantMemoryEnabled: boolean;
  geminiApiKey: "[REDACTED_PRESENT]" | "[NOT_SET]";
}

function sanitizeSettings(settings: AppSettings): SanitizedSettings {
  return {
    chatModel: settings.chatModel,
    aiProvider: settings.aiProvider ?? "ollama",
    assistantToolsEnabled: settings.assistantToolsEnabled,
    assistantAgentEnabled: settings.assistantAgentEnabled,
    assistantMemoryEnabled: settings.assistantMemoryEnabled,
    geminiApiKey:
      settings.geminiApiKey && settings.geminiApiKey.trim().length > 0
        ? "[REDACTED_PRESENT]"
        : "[NOT_SET]",
  };
}

// ── Payload builder ───────────────────────────────────────────────────────────

interface AssistantDebugPayload {
  schemaVersion: number;
  meta: {
    exportedAt: string;
    userAgent: string;
    timezone: string;
    hasElectron: boolean;
  };
  conversation: {
    id: string;
    title: string;
    updatedAt: number;
    summaryPresent: boolean;
    summaryChars: number;
    summaryPreview: string;
  };
  settingsSnapshot: SanitizedSettings;
  memory: {
    memoryBlockChars: number;
    memoryBlockPreview: string;
  };
  voiceSnapshot: {
    isListening: boolean;
    isReconnecting: boolean;
    inputTranscript: string;
    outputTranscript: string;
  };
  messages: Array<{
    id: string;
    role: string;
    content: string;
    contentChars: number;
    flags: {
      streaming: boolean;
      prefetching: boolean;
      mailRecap: boolean;
      calendarContext: boolean;
      mailManage: boolean;
      voiceSource: string | null;
      briefingSection: string | null;
      briefingRunId: string | null;
      briefingOutcome: string | null;
      briefingTasksHonesty: boolean;
      agentTaskId: string | null;
      agentGoal: string | null;
      calendarEventDraftPresent: boolean;
    };
    createdAt?: string;
  }>;
  lastOutboundChatRequests: OutboundChatRecord[];
  voiceTurnTraces: VoiceTurnTraceEntry[];
  executionTrace: ExecutionTraceEntry[];
  diagnosticLogTail: DiagnosticLogEntry[];
  controllerState: {
    isStreaming: boolean;
    activeAssistantMessageId: string | null;
  };
  connectTrace: {
    providerId: string;
    providerLabel: string;
    ok: boolean;
    reason?: string;
    verification?: Record<string, { ok: boolean; reason?: string }>;
    recordedAt: string;
  } | null;
}

interface BuildDebugPayloadOptions {
  conversation: Conversation;
  settings: AppSettings;
  memoryBlock: string;
  voiceSnapshot: {
    isListening: boolean;
    isReconnecting: boolean;
    inputTranscript: string;
    outputTranscript: string;
  };
  localMessages: ConversationMessage[];
  outboundRing: OutboundChatRecord[];
  voiceTurnTraces?: VoiceTurnTraceEntry[];
  connectTrace?: AssistantDebugPayload["connectTrace"];
  controllerState?: AssistantDebugPayload["controllerState"];
}

export function buildDebugPayload(opts: BuildDebugPayloadOptions): AssistantDebugPayload {
  const {
    conversation,
    settings,
    memoryBlock,
    voiceSnapshot,
    localMessages,
    outboundRing,
    voiceTurnTraces = [],
    connectTrace = null,
    controllerState = { isStreaming: false, activeAssistantMessageId: null },
  } = opts;

  const summary = conversation.summary ?? "";

  return {
    schemaVersion: SCHEMA_VERSION,
    meta: {
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hasElectron: !!(window as Window & { electronAPI?: unknown }).electronAPI,
    },
    conversation: {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      summaryPresent: summary.length > 0,
      summaryChars: summary.length,
      summaryPreview: summary.slice(0, 2_000),
    },
    settingsSnapshot: sanitizeSettings(settings),
    memory: {
      memoryBlockChars: memoryBlock.length,
      memoryBlockPreview: memoryBlock.slice(0, 1_000),
    },
    voiceSnapshot,
    messages: localMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      contentChars: m.content.length,
      flags: {
        streaming: m.streaming ?? false,
        prefetching: m.prefetching ?? false,
        mailRecap: m.mailRecap ?? false,
        calendarContext: m.calendarContext ?? false,
        mailManage: m.mailManage ?? false,
        voiceSource: m.voiceSource ?? null,
        briefingSection: m.briefingSection ?? null,
        briefingRunId: m.briefingRunId ?? null,
        briefingOutcome: m.briefingOutcome ?? null,
        briefingTasksHonesty: Boolean(m.briefingTasksHonesty),
        agentTaskId: m.agentTaskId ?? null,
        agentGoal: m.agentGoal ?? null,
        calendarEventDraftPresent: Boolean(m.calendarEventDraft),
      },
      createdAt: m.createdAt,
    })),
    lastOutboundChatRequests: outboundRing,
    voiceTurnTraces,
    executionTrace: getExecutionTraceSnapshot(),
    diagnosticLogTail: getDiagnosticLogSnapshot().map((entry) => ({
      ...entry,
      detail: redactDiagnosticDetail(entry.detail),
    })),
    controllerState,
    connectTrace,
  };
}

// ── Download helper ───────────────────────────────────────────────────────────

export function downloadJson(filename: string, payload: unknown): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  // Defer cleanup so the browser has time to initiate the download.
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}
