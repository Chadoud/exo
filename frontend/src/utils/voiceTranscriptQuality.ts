/**
 * @deprecated Server is authoritative — use `serverTurn` from turn_complete frames.
 * Client quality filters apply only when `serverTurn` is absent (legacy/offline).
 * Mirrors backend/services/turn/quality.py.
 */

import { looksLikeEchoOfPriorAssistant } from "./voiceEchoGuard";

/** How many recent assistant bubbles to scan for speaker echo. */
export const VOICE_ASSISTANT_ECHO_LOOKBACK = 12;

/** After briefing sections finish, ignore stray mic STT for this long (ms). */
const BRIEFING_USER_COMMIT_COOLDOWN_MS = 4_000;

const NOISE_TAG_PATTERN = /^<\s*noise\s*>$/i;
const ALLOWED_SHORT_UTTERANCES = new Set([
  "oui",
  "yes",
  "no",
  "non",
  "ok",
  "si",
  "merci",
  "stop",
  "sure",
  "yeah",
  "yep",
  "salut",
  "bonjour",
  "bonsoir",
]);

/** Short time/duration answers — valid replies to "what time?" follow-ups. */
const TIME_SHORT_ANSWERS = new Set([
  "midi",
  "matin",
  "soir",
  "minuit",
  "demain",
  "noon",
  "morning",
  "evening",
  "midnight",
  "tomorrow",
  "heure",
  "heures",
  "hour",
  "hours",
  "minute",
  "minutes",
]);

const TIME_TOKEN_PATTERN = /^\d{1,2}\s*h(?:eures?)?$/i;

function wordKey(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function isMeaningfulShortReply(text: string): boolean {
  if (ALLOWED_SHORT_UTTERANCES.has(firstWordKey(text))) return true;
  const words = text.split(/\s+/);
  if (words.some((w) => TIME_SHORT_ANSWERS.has(wordKey(w)))) return true;
  if (TIME_TOKEN_PATTERN.test(text.trim())) return true;
  return false;
}

function firstWordKey(text: string): string {
  const word = text.trim().split(/\s+/)[0] ?? "";
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Normalize voice lines before they appear in chat (Gemini often prefixes a space). */
export function normalizeVoiceTranscriptText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * True for empty lines and explicit STT noise placeholders only.
 * Use while streaming partial Live STT — short fragments like "Peux-tu" must
 * not be dropped before the rest of the sentence arrives.
 */
export function isVoiceTranscriptNoisePlaceholder(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return NOISE_TAG_PATTERN.test(trimmed) || /^\[noise\]$/i.test(trimmed);
}

function isWordSubsequence(shorter: string[], longer: string[]): boolean {
  let index = 0;
  for (const word of shorter) {
    const key = wordKey(word);
    while (index < longer.length && wordKey(longer[index] ?? "") !== key) {
      index += 1;
    }
    if (index >= longer.length) return false;
    index += 1;
  }
  return true;
}

function looksLikeSnapshot(previous: string, chunk: string): boolean {
  const incomingWords = chunk.trim().split(/\s+/);
  const previousWords = previous.trim().split(/\s+/);
  if (incomingWords.length < 4 || previousWords.length < 3) return false;
  return incomingWords.slice(0, 3).map(wordKey).join(" ") === previousWords.slice(0, 3).map(wordKey).join(" ");
}

/** Append one incremental Live STT chunk. Junk filtering waits for turn_complete. */
export function appendStreamingVoiceInputTranscript(previous: string, chunk: string): string {
  if (isVoiceTranscriptNoisePlaceholder(chunk)) return previous;
  if (looksLikeSnapshot(previous, chunk)) {
    const previousWords = previous.trim().split(/\s+/);
    const incomingWords = chunk.trim().split(/\s+/);
    if (incomingWords.length < previousWords.length && isWordSubsequence(incomingWords, previousWords)) {
      return previous;
    }
    return chunk;
  }
  return previous + chunk;
}

/** True for STT placeholders and meaningless micro-fragments (turn_complete only). */
export function isJunkVoiceTranscript(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (NOISE_TAG_PATTERN.test(trimmed) || /^\[noise\]$/i.test(trimmed)) return true;

  const lettersOnly = trimmed.replace(/[^\p{L}\p{N}]/gu, "");
  if (!lettersOnly) return true;

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 2 && trimmed.length <= 14) {
    if (isMeaningfulShortReply(trimmed)) return false;
    if (trimmed.endsWith(",") || trimmed.length <= 8) return true;
  }

  return false;
}

export interface VoiceUserCommitContext {
  briefingActive: boolean;
  msSinceBriefingEnded: number;
}

/**
 * Whether a completed voice user line should become a chat message.
 */
export function shouldCommitVoiceUserTranscript(
  userText: string,
  _sameTurnAssistant: string,
  recentAssistantLines: readonly string[],
  context: VoiceUserCommitContext,
): boolean {
  const normalized = normalizeVoiceTranscriptText(userText);
  if (!normalized) return false;
  if (context.briefingActive) return false;
  if (context.msSinceBriefingEnded < BRIEFING_USER_COMMIT_COOLDOWN_MS) return false;
  if (isJunkVoiceTranscript(normalized)) return false;

  const lookback = recentAssistantLines.slice(-VOICE_ASSISTANT_ECHO_LOOKBACK);
  if (looksLikeEchoOfPriorAssistant(normalized, lookback)) return false;

  return true;
}
