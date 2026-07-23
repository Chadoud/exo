/**
 * Maps BriefingOffer voice frames → UI phase and sends client actions on the WS.
 */

import { useCallback, useState } from "react";
import type {
  BriefingOfferClientAction,
  BriefingOfferPhase,
  BriefingOfferServerEvent,
} from "../voice/briefingOfferTypes";

export interface UseBriefingOfferUiOptions {
  /** Send a JSON frame on the open voice WebSocket (no-op when disconnected). */
  sendFrame: (frame: Record<string, unknown>) => void;
}

export interface UseBriefingOfferUiReturn {
  phase: BriefingOfferPhase;
  errorMessage: string | null;
  /** True while Offering / Loading / Error — hosts should keep chrome visible. */
  isActive: boolean;
  confirmAlwaysOpen: boolean;
  handleServerEvent: (event: BriefingOfferServerEvent) => void;
  accept: () => void;
  skipSession: () => void;
  never: () => void;
  openAlwaysConfirm: () => void;
  confirmAlways: () => void;
  cancelAlwaysConfirm: () => void;
  cancel: () => void;
  retry: () => void;
  /** Clear local UI without sending (e.g. session teardown). */
  clearLocal: () => void;
}

function sendAction(
  sendFrame: (frame: Record<string, unknown>) => void,
  type: BriefingOfferClientAction,
): void {
  sendFrame({ type });
}

/**
 * BriefingOffer chrome state — Offering / Loading / Error — driven by server frames.
 */
export function useBriefingOfferUi(options: UseBriefingOfferUiOptions): UseBriefingOfferUiReturn {
  const { sendFrame } = options;
  const [phase, setPhase] = useState<BriefingOfferPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmAlwaysOpen, setConfirmAlwaysOpen] = useState(false);

  const clearLocal = useCallback(() => {
    setPhase("idle");
    setErrorMessage(null);
    setConfirmAlwaysOpen(false);
  }, []);

  const handleServerEvent = useCallback((event: BriefingOfferServerEvent) => {
    switch (event.type) {
      case "briefing_offer":
        setPhase("offering");
        setErrorMessage(null);
        setConfirmAlwaysOpen(false);
        break;
      case "briefing_loading":
        setPhase("loading");
        setErrorMessage(null);
        setConfirmAlwaysOpen(false);
        break;
      case "briefing_offer_error":
        setPhase("error");
        setErrorMessage(event.message.trim() || "Couldn't start today's briefing.");
        setConfirmAlwaysOpen(false);
        break;
      case "briefing_offer_clear":
      case "briefing_running":
        setPhase("idle");
        setErrorMessage(null);
        setConfirmAlwaysOpen(false);
        break;
      default:
        break;
    }
  }, []);

  const accept = useCallback(() => {
    sendAction(sendFrame, "briefing_offer_accept");
    setPhase("loading");
    setConfirmAlwaysOpen(false);
  }, [sendFrame]);

  const skipSession = useCallback(() => {
    sendAction(sendFrame, "briefing_offer_skip_session");
    clearLocal();
  }, [sendFrame, clearLocal]);

  const never = useCallback(() => {
    sendAction(sendFrame, "briefing_offer_never");
    clearLocal();
  }, [sendFrame, clearLocal]);

  const openAlwaysConfirm = useCallback(() => {
    if (phase !== "offering") return;
    setConfirmAlwaysOpen(true);
  }, [phase]);

  const confirmAlways = useCallback(() => {
    sendAction(sendFrame, "briefing_offer_always");
    setConfirmAlwaysOpen(false);
    setPhase("loading");
  }, [sendFrame]);

  const cancelAlwaysConfirm = useCallback(() => {
    setConfirmAlwaysOpen(false);
  }, []);

  const cancel = useCallback(() => {
    sendAction(sendFrame, "briefing_offer_cancel");
    clearLocal();
  }, [sendFrame, clearLocal]);

  const retry = useCallback(() => {
    sendAction(sendFrame, "briefing_offer_retry");
    setPhase("loading");
    setErrorMessage(null);
  }, [sendFrame]);

  return {
    phase,
    errorMessage,
    isActive: phase !== "idle",
    confirmAlwaysOpen,
    handleServerEvent,
    accept,
    skipSession,
    never,
    openAlwaysConfirm,
    confirmAlways,
    cancelAlwaysConfirm,
    cancel,
    retry,
    clearLocal,
  };
}
