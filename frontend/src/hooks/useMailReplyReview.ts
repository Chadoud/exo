import { useCallback, useEffect, useRef, useState } from "react";
import { EntitlementBlockedError } from "../api/client";
import {
  draftMailReply,
  saveMailReplyDraft,
  sendMailReply,
  type MailReplyDraft,
} from "../api/mailReplies";
import { trackProductEvent } from "../telemetry/assistantTelemetry";
import { TelemetryEventNames } from "../telemetry/schema";

type Check = "pending" | "ok" | "fail";
type Block = "none" | "token_fail" | "thread_changed";

type DraftFields = {
  subject: string;
  body: string;
  toName: string;
  toEmail: string;
  draftToken: string;
  dirty: boolean;
  check: Check;
  block: Block;
  error: string | null;
};

export type MailReplyReviewState =
  | { status: "collapsed" }
  | ({ status: "ready" } & DraftFields)
  | ({ status: "confirm" } & DraftFields)
  | ({ status: "sending" } & DraftFields);

const COLLAPSED: MailReplyReviewState = { status: "collapsed" };

export function isMailReplyDrafty(
  state: MailReplyReviewState,
): state is Extract<MailReplyReviewState, { subject: string }> {
  return state.status === "ready" || state.status === "confirm" || state.status === "sending";
}

function errorClass(err: unknown): string {
  if (err instanceof EntitlementBlockedError) return "entitlement";
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("thread_changed") || msg.includes("thread_gone")) return "thread_changed";
  if (msg.includes("429") || msg.includes("rate")) return "rate_limited";
  return "failed";
}

function seedFields(seed: { subject: string; body: string; toName: string }): DraftFields {
  return {
    subject: seed.subject,
    body: seed.body,
    toName: seed.toName,
    toEmail: "",
    draftToken: "",
    dirty: false,
    check: "pending",
    block: "none",
    error: null,
  };
}

function mergeMint(prev: DraftFields, draft: MailReplyDraft): DraftFields {
  return {
    ...prev,
    draftToken: draft.draft_token,
    toName: draft.to_name || prev.toName,
    toEmail: draft.to_email,
    subject: prev.dirty ? prev.subject : draft.subject,
    body: prev.dirty ? prev.body : draft.body,
    check: "ok",
    block: "none",
    error: null,
  };
}

export function useMailReplyReview(
  cardId: number,
  copy: {
    threadChanged: string;
    sendFailed: string;
    checkFailed: string;
  },
  seed: { subject: string; body: string; toName: string },
) {
  const [state, setState] = useState<MailReplyReviewState>(COLLAPSED);
  const sendingRef = useRef(false);
  const reviewGen = useRef(0);
  const reviewInFlight = useRef(false);
  const latestRef = useRef(state);
  latestRef.current = state;

  const persistIfDirty = useCallback(
    (current: MailReplyReviewState) => {
      if (!isMailReplyDrafty(current) || !current.dirty) return;
      void saveMailReplyDraft(cardId, { subject: current.subject, body: current.body });
    },
    [cardId],
  );

  const collapse = useCallback(() => {
    if (sendingRef.current) return;
    reviewGen.current += 1;
    reviewInFlight.current = false;
    persistIfDirty(latestRef.current);
    setState(COLLAPSED);
  }, [persistIfDirty]);

  const failMessage = useCallback(
    (err: unknown, kind: "check" | "send") => {
      if (errorClass(err) === "thread_changed") return copy.threadChanged;
      return kind === "check" ? copy.checkFailed : copy.sendFailed;
    },
    [copy.checkFailed, copy.sendFailed, copy.threadChanged],
  );

  const review = useCallback(async () => {
    if (sendingRef.current || reviewInFlight.current) return;
    const gen = ++reviewGen.current;
    reviewInFlight.current = true;
    setState({ status: "ready", ...seedFields(seed) });
    try {
      const draft = await draftMailReply(cardId);
      if (gen !== reviewGen.current) return;
      setState((prev) =>
        isMailReplyDrafty(prev) ? { ...prev, ...mergeMint(prev, draft) } : prev,
      );
      trackProductEvent(TelemetryEventNames.mailReplyOpened, {});
    } catch (err) {
      if (gen !== reviewGen.current) return;
      trackProductEvent(TelemetryEventNames.mailReplyFailed, { error_class: errorClass(err) });
      const block: Block = errorClass(err) === "thread_changed" ? "thread_changed" : "token_fail";
      setState((prev) =>
        isMailReplyDrafty(prev)
          ? { ...prev, status: "ready", check: "fail", block, error: failMessage(err, "check") }
          : prev,
      );
    } finally {
      if (gen === reviewGen.current) reviewInFlight.current = false;
    }
  }, [cardId, failMessage, seed]);

  const setSubject = useCallback((subject: string) => {
    setState((prev) => (isMailReplyDrafty(prev) ? { ...prev, subject, dirty: true } : prev));
  }, []);

  const setBody = useCallback((body: string) => {
    setState((prev) => (isMailReplyDrafty(prev) ? { ...prev, body, dirty: true } : prev));
  }, []);

  const openConfirm = useCallback(() => {
    setState((prev) => {
      if (!isMailReplyDrafty(prev) || !prev.body.trim()) return prev;
      if (prev.block !== "none") return prev;
      return { ...prev, status: "confirm" };
    });
  }, []);

  const keepEditing = useCallback(() => {
    setState((prev) => (isMailReplyDrafty(prev) ? { ...prev, status: "ready" } : prev));
  }, []);

  const send = useCallback(async (): Promise<boolean> => {
    if (sendingRef.current || !isMailReplyDrafty(state)) return false;
    if (state.check !== "ok" || !state.draftToken || !state.body.trim() || !state.toEmail.trim()) {
      return false;
    }
    sendingRef.current = true;
    setState({ ...state, status: "sending", error: null });
    try {
      await sendMailReply({
        draft_token: state.draftToken,
        subject: state.subject,
        body: state.body,
      });
      trackProductEvent(TelemetryEventNames.mailReplySent, {});
      setState(COLLAPSED);
      return true;
    } catch (err) {
      trackProductEvent(TelemetryEventNames.mailReplyFailed, { error_class: errorClass(err) });
      setState({ ...state, status: "ready", error: failMessage(err, "send") });
      return false;
    } finally {
      sendingRef.current = false;
    }
  }, [failMessage, state]);

  useEffect(() => {
    return () => {
      if (sendingRef.current) return;
      persistIfDirty(latestRef.current);
    };
  }, [persistIfDirty]);

  return {
    state,
    review,
    collapse,
    setSubject,
    setBody,
    openConfirm,
    keepEditing,
    send,
  };
}
