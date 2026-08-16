/**
 * Closed briefing section outcomes for chat. No fetch payloads.
 */

import type { ConversationMessage } from "../../../hooks/useConversations";

export const BRIEFING_SECTION_RECORD_OUTCOMES = [
  "skipped_fail",
  "skipped_reconnect",
  "nothing",
  "aborted",
  "dropped",
] as const;

export type BriefingSectionRecordOutcome = (typeof BRIEFING_SECTION_RECORD_OUTCOMES)[number];

export type BriefingOutcome = "spoken" | BriefingSectionRecordOutcome | "empty_captions";

export const STARTUP_BRIEFING_TOOL = "run_startup_briefing";

const OUTCOME_BODY_KEYS: Record<Exclude<BriefingOutcome, "spoken">, string> = {
  skipped_fail: "assistant.briefingOutcomeSkippedFail",
  skipped_reconnect: "assistant.briefingOutcomeSkippedReconnect",
  nothing: "assistant.briefingOutcomeNothingToReport",
  empty_captions: "assistant.briefingOutcomeEmptyCaptions",
  aborted: "assistant.briefingOutcomeAborted",
  dropped: "assistant.briefingOutcomeMidSectionDrop",
};

export function isBriefingSectionRecordOutcome(
  value: string,
): value is BriefingSectionRecordOutcome {
  return (BRIEFING_SECTION_RECORD_OUTCOMES as readonly string[]).includes(value);
}

export function isBriefingMuted(outcome: BriefingOutcome | null | undefined): boolean {
  return Boolean(outcome && outcome !== "spoken");
}

export function briefingOutcomeBodyKey(
  outcome: BriefingOutcome | null | undefined,
): string | null {
  if (!outcome || outcome === "spoken") return null;
  return OUTCOME_BODY_KEYS[outcome];
}

/** Refuse Gemini injection text — must never land in conversation storage. */
export function sanitizeBriefingAssistantText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("[BRIEFING:")) return "";
  return text;
}

export function briefingSectionAlreadyRecorded(
  messages: readonly ConversationMessage[],
  briefingRunId: string | null,
  section: string | null,
): boolean {
  if (!briefingRunId || !section) return false;
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.briefingRunId === briefingRunId &&
      message.briefingSection === section,
  );
}

export function appendBriefingSectionRecord(
  prev: ConversationMessage[],
  input: {
    section: string;
    outcome: BriefingSectionRecordOutcome | "empty_captions";
    briefingRunId: string;
    makeMessageId: () => string;
    nowIso?: string;
  },
): ConversationMessage[] {
  if (briefingSectionAlreadyRecorded(prev, input.briefingRunId, input.section)) {
    return prev;
  }
  return [
    ...prev,
    {
      id: input.makeMessageId(),
      role: "assistant",
      content: "",
      createdAt: input.nowIso ?? new Date().toISOString(),
      voiceSource: STARTUP_BRIEFING_TOOL,
      briefingSection: input.section,
      briefingRunId: input.briefingRunId,
      briefingOutcome: input.outcome,
    },
  ];
}

export function appendBriefingTasksHonesty(
  prev: ConversationMessage[],
  input: { makeMessageId: () => string; nowIso?: string },
): ConversationMessage[] {
  const already = prev.some((message) => message.briefingTasksHonesty);
  if (already) return prev;
  return [
    ...prev,
    {
      id: input.makeMessageId(),
      role: "assistant",
      content: "",
      createdAt: input.nowIso ?? new Date().toISOString(),
      briefingTasksHonesty: true,
    },
  ];
}
