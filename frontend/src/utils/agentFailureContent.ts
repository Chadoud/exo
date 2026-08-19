/** Parsed agent run failure stored as `Goal: …\nOutcome: …` in episodic memory. */
export type ParsedAgentFailure = {
  goal: string;
  outcome: string;
  raw: string;
};

/**
 * Soft wrapper so Inbox Retry stays distinguishable in logs / turn classification.
 * The server classifies the *underlying goal* (mail → read_mail, etc.).
 * Keep in sync with `services.assistant.intent._AGENT_RETRY_RE`.
 */
export const AGENT_FAILURE_RETRY_PREFIX = "Please retry this:";

const AGENT_RETRY_PREFIX_RE = /^please\s+retry\s+this(?:\s+autonomously)?\s*:\s*/i;

/**
 * Split orchestrator failure text into goal and outcome for inbox cards.
 * Falls back to the full string when the format is unexpected.
 */
export function parseAgentFailureContent(content: string): ParsedAgentFailure {
  const raw = content.trim();
  if (!raw) return { goal: "", outcome: "", raw };

  const goalMatch = /^Goal:\s*([\s\S]*?)(?:\nOutcome:\s*|$)/i.exec(raw);
  const outcomeMatch = /\nOutcome:\s*([\s\S]*)$/i.exec(raw);

  if (goalMatch) {
    return {
      goal: goalMatch[1]?.trim() ?? "",
      outcome: outcomeMatch?.[1]?.trim() ?? "",
      raw,
    };
  }

  return { goal: raw, outcome: "", raw };
}

/**
 * Prefill for Chat when the user taps Retry on a failed agent run.
 * Sends the original goal only — never the failure outcome.
 */
export function buildAgentFailureRetryPrompt(parsed: ParsedAgentFailure): string {
  const goal = (parsed.goal || parsed.raw).trim();
  if (!goal) return "";
  return `${AGENT_FAILURE_RETRY_PREFIX} ${goal}`;
}

/** Strip the Inbox Retry prefix so the agent goal is the original ask. */
export function extractAgentRetryGoal(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.replace(AGENT_RETRY_PREFIX_RE, "").trim() || trimmed;
}

const UNPARSEABLE_ASK =
  /can'?t determine what you'?re asking|doesn'?t state a complete request|is cut off|resend the full (question|task)/i;

/** True when a stored failure is not recoverable work (cut-off STT, empty ask). */
export function isTrashAgentFailure(parsed: ParsedAgentFailure): boolean {
  const goal = parsed.goal.trim();
  if (!goal) return true;
  if (UNPARSEABLE_ASK.test(parsed.outcome)) return true;
  const words = goal.match(/[^\W_]+/g) ?? [];
  if (goal.trimStart().startsWith(".") && words.length <= 4) return true;
  return false;
}

/** First line of an outcome for the collapsed Inbox card. Empty when there is no why. */
export function oneLineFailureWhy(outcome: string): string {
  const trimmed = outcome.trim();
  if (!trimmed) return "";
  return trimmed.split(/\n/, 1)[0]?.trim() ?? "";
}
