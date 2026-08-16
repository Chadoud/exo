/**
 * Single path for persisting voice turns into chat history.
 */

import type { ConversationMessage } from "../../../hooks/useConversations";
import {
  normalizeVoiceTranscriptText,
  shouldCommitVoiceUserTranscript,
  type VoiceUserCommitContext,
} from "../../../utils/voiceTranscriptQuality";
import { VOICE_TOOL_START_CODEGEN_STUDIO } from "../../../constants";
import type { CalendarDeleteDraft } from "../../../utils/calendarDeleteConfirm";
import {
  briefingSectionAlreadyRecorded,
  sanitizeBriefingAssistantText,
  STARTUP_BRIEFING_TOOL,
} from "./briefingOutcome";
import type { BriefingOutcome } from "./briefingOutcome";

/** Metadata captured at voice turn_complete (see useVoiceSession.consumeTurnCommitMeta). */
export interface VoiceTurnCommitMeta {
  toolName: string | null;
  toolSource: string | null;
  briefingSection: string | null;
  briefingOutcome?: BriefingOutcome | null;
  /** Server-authoritative transcript payload from the turn_complete frame. */
  serverTurn?: ServerTurnCommitPayload | null;
}

/** Authoritative turn text from the backend at turn_complete. */
export interface ServerTurnCommitPayload {
  userText: string;
  assistantText: string;
  userCommitted: boolean;
  dropReason: string | null;
  /** Raw STT before junk/echo filters — present when the server dropped the turn. */
  userTextRaw?: string | null;
}

interface VoiceTurnCommitInput {
  userText: string;
  assistantText: string;
  meta: VoiceTurnCommitMeta | null;
  briefingRunId: string | null;
  recentAssistantLines: readonly string[];
  userCommitContext: VoiceUserCommitContext;
  makeMessageId: () => string;
  nowIso?: string;
  calendarDeleteDraft?: CalendarDeleteDraft | null;
}

function resolveVoiceSource(meta: VoiceTurnCommitMeta | null): string | undefined {
  if (!meta) return undefined;
  if (meta.toolName) return meta.toolName;
  if (meta.toolSource) return meta.toolSource;
  return undefined;
}

/** Collapse redundant time suffixes in calendar recaps for dedupe. */
function normalizeRecapForDedupe(text: string): string {
  return text
    .trim()
    .replace(
      /(\s—\s+.+?)\s+à\s+\d{1,2}(?::\d{2})?h?\s*(\.\s*Je crée l'événement\s*\?)/i,
      "$1$2",
    );
}

function assistantRecapTextsMatch(previous: string, next: string): boolean {
  const prev = previous.trim();
  const candidate = next.trim();
  if (prev === candidate) return true;
  return normalizeRecapForDedupe(prev) === normalizeRecapForDedupe(candidate);
}

function isBriefingTurn(meta: VoiceTurnCommitMeta | null, briefingRunId: string | null): boolean {
  if (briefingRunId) return true;
  if (!meta) return false;
  if (meta.toolName === STARTUP_BRIEFING_TOOL) return true;
  if (meta.briefingSection) return true;
  return false;
}

const VOICE_COALESCE_MS = 2000;
const VOICE_CONTINUATION_RE =
  /^(and|also|et|puis|then|like|uh|um|as|and like|and i)\b/i;

/** Merge fragmented voice STT lines into one user bubble when spoken in quick succession. */
function coalesceVoiceUserMessage(
  prev: ConversationMessage[],
  newText: string,
  nowIso: string,
): ConversationMessage[] {
  const last = prev[prev.length - 1];
  if (last?.role !== "user" || last.voiceSource !== "voice") return prev;
  const lastTime = last.createdAt ? Date.parse(last.createdAt) : Number.NaN;
  const nowTime = Date.parse(nowIso);
  if (!Number.isFinite(lastTime) || nowTime - lastTime > VOICE_COALESCE_MS) return prev;
  const lastText = last.content.trim();
  const candidate = newText.trim();
  if (!candidate) return prev;
  const lastIncomplete = !/[.!?]$/.test(lastText);
  const continues = VOICE_CONTINUATION_RE.test(candidate);
  if (!lastIncomplete && !continues) return prev;
  const merged = `${lastText} ${candidate}`.replace(/\s+/g, " ").trim();
  return [...prev.slice(0, -1), { ...last, content: merged, createdAt: nowIso }];
}

/**
 * Appends completed voice turn lines to chat history — one assistant bubble per turn.
 */
export function appendVoiceTurnMessages(
  prev: ConversationMessage[],
  input: VoiceTurnCommitInput,
): ConversationMessage[] {
  const server = input.meta?.serverTurn;
  // Server TurnService is authoritative when serverTurn is present; legacy client
  // filters below apply only for offline / pre-turn_complete commits.
  const normalizedInput = normalizeVoiceTranscriptText(
    server?.userCommitted ? server.userText : input.userText,
  );
  const normalizedOutput = sanitizeBriefingAssistantText(
    normalizeVoiceTranscriptText(server?.assistantText ?? input.assistantText),
  );
  const nowIso = input.nowIso ?? new Date().toISOString();
  const next = [...prev];

  const shouldCommitUser =
    server != null
      ? server.userCommitted && Boolean(normalizedInput)
      : Boolean(
          normalizedInput &&
            shouldCommitVoiceUserTranscript(
              normalizedInput,
              normalizedOutput,
              input.recentAssistantLines,
              input.userCommitContext,
            ),
        );

  if (shouldCommitUser) {
    const lastUserBefore = next[next.length - 1]?.content;
    const coalesced = coalesceVoiceUserMessage(next, normalizedInput, nowIso);
    const didCoalesce =
      coalesced.length === next.length &&
      coalesced[coalesced.length - 1]?.content !== lastUserBefore;
    if (didCoalesce) {
      const withUser = coalesced;
      if (!normalizedOutput) return withUser;
      const last = withUser[withUser.length - 1];
      if (
        last?.role === "assistant" &&
        assistantRecapTextsMatch(last.content, normalizedOutput)
      ) {
        return withUser;
      }
      return [
        ...withUser,
        {
          id: input.makeMessageId(),
          role: "assistant" as const,
          content: normalizedOutput,
          createdAt: nowIso,
          voiceSource:
            resolveVoiceSource(input.meta) ??
            (isBriefingTurn(input.meta, input.briefingRunId)
              ? STARTUP_BRIEFING_TOOL
              : undefined),
          briefingSection: input.meta?.briefingSection ?? undefined,
          briefingRunId: isBriefingTurn(input.meta, input.briefingRunId)
            ? input.briefingRunId ?? undefined
            : undefined,
          calendarDeleteDraft: input.calendarDeleteDraft ?? undefined,
        },
      ];
    }
    const last = next[next.length - 1];
    const duplicateUser =
      last?.role === "user" &&
      normalizeVoiceTranscriptText(last.content) === normalizedInput;
    if (!duplicateUser) {
      next.push({
        id: input.makeMessageId(),
        role: "user",
        content: normalizedInput,
        createdAt: nowIso,
        voiceSource: "voice",
      });
    }
  }

  const briefingTurn = isBriefingTurn(input.meta, input.briefingRunId);
  const section = input.meta?.briefingSection ?? null;
  if (
    briefingTurn &&
    briefingSectionAlreadyRecorded(next, input.briefingRunId, section)
  ) {
    return next;
  }

  if (!normalizedOutput) {
    if (briefingTurn && section && input.briefingRunId) {
      next.push({
        id: input.makeMessageId(),
        role: "assistant",
        content: "",
        createdAt: nowIso,
        voiceSource: STARTUP_BRIEFING_TOOL,
        briefingSection: section,
        briefingRunId: input.briefingRunId,
        briefingOutcome: "empty_captions",
      });
    }
    return next;
  }

  if (input.meta?.toolName === VOICE_TOOL_START_CODEGEN_STUDIO) {
    const studioCard = [...next]
      .reverse()
      .find((m) => m.role === "assistant" && m.content === "__codegen_studio__");
    if (studioCard) {
      return next;
    }
  }

  const last = next[next.length - 1];
  if (
    last?.role === "assistant" &&
    assistantRecapTextsMatch(last.content, normalizedOutput)
  ) {
    return next;
  }

  const voiceSource = resolveVoiceSource(input.meta);

  next.push({
    id: input.makeMessageId(),
    role: "assistant",
    content: normalizedOutput,
    createdAt: nowIso,
    voiceSource: voiceSource ?? (briefingTurn ? STARTUP_BRIEFING_TOOL : undefined),
    briefingSection: input.meta?.briefingSection ?? undefined,
    briefingRunId: briefingTurn ? input.briefingRunId ?? undefined : undefined,
    briefingOutcome: briefingTurn ? "spoken" : undefined,
    calendarDeleteDraft: input.calendarDeleteDraft ?? undefined,
  });

  return next;
}
