/**
 * Land starts muted so BriefingOffer can appear without the first utterance
 * racing the card. Conversation mode must unmute or speech is sent as silence.
 */

import type { VoiceInteractionMode } from "../types/voiceInteraction";
import type { BriefingOfferPhase } from "./briefingOfferTypes";

/** Wait for a pending `briefing_offer` frame before opening the mic on idle land. */
export const CONVERSATION_LAND_UNMUTE_GRACE_MS = 800;

type ConversationLandMicAction = "hold" | "unmute" | "unmute_after_grace";

export function conversationLandMicAction(input: {
  mode: VoiceInteractionMode;
  isListening: boolean;
  offerPhase: BriefingOfferPhase;
}): ConversationLandMicAction {
  if (input.mode !== "conversation" || !input.isListening) return "hold";
  if (input.offerPhase !== "idle") return "unmute";
  return "unmute_after_grace";
}
