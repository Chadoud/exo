/**
 * Shared types for the startup BriefingOffer UI (server SM ↔ client chrome).
 */

export type BriefingOfferPhase = "idle" | "offering" | "loading" | "error";

/** Server → client events routed into {@link useBriefingOfferUi}. */
export type BriefingOfferServerEvent =
  | { type: "briefing_offer" }
  | { type: "briefing_loading" }
  | { type: "briefing_offer_error"; message: string }
  | { type: "briefing_offer_clear" }
  | { type: "briefing_running" };

/** Client → server JSON frame `type` values on the voice WebSocket. */
export type BriefingOfferClientAction =
  | "briefing_offer_accept"
  | "briefing_offer_skip_session"
  | "briefing_offer_never"
  | "briefing_offer_always"
  | "briefing_offer_cancel"
  | "briefing_offer_retry";
