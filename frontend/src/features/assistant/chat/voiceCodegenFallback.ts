import { isCodegenTask } from "../../../systemCommands/assistantIntentHelpers";
import type { VoiceTurnCommitMeta } from "./commitAssistantTurn";

/** Model often speaks this without calling `start_codegen_studio`. */
const CODEGEN_STUDIO_SPOKEN_RE =
  /\b(codegen studio|opening that in codegen|ouvr(?:e|ure).*codegen|öffne.*codegen|apro.*codegen)\b/i;

/** Short confirmations — not enough to be a build goal by themselves. */
const SHORT_FOLLOW_UP_RE =
  /^(?:do\s+it|go\s+ahead|yes(?:\s+do\s+it)?|yep|yeah|please|now|continue|try\s+again|same\s+thing|make\s+it\s+happen|ok(?:ay)?|sure)(?:\s*[.!]*)?$/i;

export function assistantSpokeCodegenStudioIntent(assistantText: string): boolean {
  return CODEGEN_STUDIO_SPOKEN_RE.test(assistantText.trim());
}

function isShortFollowUp(text: string): boolean {
  return SHORT_FOLLOW_UP_RE.test(text.trim());
}

/**
 * Goal for a missed voice codegen tool call — prefers the current utterance, else a recent build request.
 *
 * Product rule: if the assistant already said it is opening Codegen Studio, the user's
 * words are the goal — they should never have to say "Codegen Studio" themselves.
 */
export function resolveVoiceCodegenFallbackGoal(
  userText: string,
  assistantText: string,
  recentCodegenUserUtterances: readonly string[],
): string | null {
  const current = userText.trim();
  if (current && isCodegenTask(current)) return current;

  if (assistantSpokeCodegenStudioIntent(assistantText)) {
    // Model promised the studio — use what the user actually said (typos included).
    if (current && !isShortFollowUp(current)) return current;
    for (let i = recentCodegenUserUtterances.length - 1; i >= 0; i -= 1) {
      const prior = recentCodegenUserUtterances[i]?.trim();
      if (prior && isCodegenTask(prior)) return prior;
    }
  }
  return null;
}

/**
 * True when the voice model skipped `start_codegen_studio` but the turn was an app-build request.
 */
export function shouldLaunchVoiceCodegenFallback(
  _userText: string,
  _assistantText: string,
  _meta: VoiceTurnCommitMeta | null,
  _recentCodegenUserUtterances: readonly string[] = [],
): boolean {
  // Spoken words never launch. Only an admitted start_codegen_studio tool_result may.
  return false;
}
