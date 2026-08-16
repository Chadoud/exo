import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EntitlementBlockedError } from "../api/client";
import { draftMailReply, sendMailReply, type MailReplyDraft } from "../api/mailReplies";
import { trackProductEvent } from "../telemetry/assistantTelemetry";
import { TelemetryEventNames } from "../telemetry/schema";

type DraftFields = {
  subject: string;
  body: string;
  toName: string;
  toEmail: string;
  draftToken: string;
  dirty: boolean;
  llmFailed: boolean;
  error: string | null;
};

export type MailReplyReviewState =
  | { status: "collapsed" }
  | { status: "working" }
  | { status: "error"; error: string }
  | ({ status: "draft" } & DraftFields)
  | ({ status: "confirm" } & DraftFields)
  | ({ status: "sending" } & DraftFields);

const COLLAPSED: MailReplyReviewState = { status: "collapsed" };

export function isMailReplyDrafty(
  state: MailReplyReviewState,
): state is Extract<MailReplyReviewState, { subject: string }> {
  return state.status === "draft" || state.status === "confirm" || state.status === "sending";
}

function errorClass(err: unknown): string {
  if (err instanceof EntitlementBlockedError) return "entitlement";
  const msg = err instanceof Error ? err.message : "";
  if (msg.includes("thread_changed") || msg.includes("thread_gone")) return "thread_changed";
  if (msg.includes("429") || msg.includes("rate")) return "rate_limited";
  return "failed";
}

function draftFromApi(draft: MailReplyDraft, error: string | null = null): DraftFields {
  return {
    subject: draft.subject,
    body: draft.body,
    toName: draft.to_name,
    toEmail: draft.to_email,
    draftToken: draft.draft_token,
    dirty: false,
    llmFailed: !draft.body.trim(),
    error,
  };
}

export function useMailReplyReview(
  cardId: number,
  copy: {
    threadChanged: string;
    sendFailed: string;
    draftFailed: string;
    draftDiscarded: string;
  },
) {
  const [state, setState] = useState<MailReplyReviewState>(COLLAPSED);
  const dirtyRef = useRef(false);
  const sendingRef = useRef(false);
  const reviewGen = useRef(0);
  const reviewInFlight = useRef(false);

  useEffect(() => {
    dirtyRef.current = isMailReplyDrafty(state) ? state.dirty : false;
  }, [state]);

  const discardIfNeeded = useCallback(
    (edited: boolean) => {
      if (edited) toast.message(copy.draftDiscarded);
    },
    [copy.draftDiscarded],
  );

  const collapse = useCallback(
    (opts?: { silent?: boolean }) => {
      if (sendingRef.current) return;
      reviewGen.current += 1;
      reviewInFlight.current = false;
      const edited = dirtyRef.current;
      setState(COLLAPSED);
      if (!opts?.silent) discardIfNeeded(edited);
    },
    [discardIfNeeded],
  );

  useEffect(() => {
    return () => {
      if (sendingRef.current) return;
      if (dirtyRef.current) toast.message(copy.draftDiscarded);
    };
  }, [copy.draftDiscarded]);

  const failMessage = useCallback(
    (err: unknown, kind: "draft" | "send") => {
      if (errorClass(err) === "thread_changed") return copy.threadChanged;
      return kind === "draft" ? copy.draftFailed : copy.sendFailed;
    },
    [copy.draftFailed, copy.sendFailed, copy.threadChanged],
  );

  const review = useCallback(async () => {
    if (sendingRef.current || reviewInFlight.current) return;
    const gen = ++reviewGen.current;
    reviewInFlight.current = true;
    setState({ status: "working" });
    try {
      const draft = await draftMailReply(cardId);
      if (gen !== reviewGen.current) return;
      setState({ status: "draft", ...draftFromApi(draft) });
      trackProductEvent(TelemetryEventNames.mailReplyOpened, {});
    } catch (err) {
      if (gen !== reviewGen.current) return;
      trackProductEvent(TelemetryEventNames.mailReplyFailed, { error_class: errorClass(err) });
      setState({ status: "error", error: failMessage(err, "draft") });
    } finally {
      if (gen === reviewGen.current) reviewInFlight.current = false;
    }
  }, [cardId, failMessage]);

  const setSubject = useCallback((subject: string) => {
    setState((prev) => (isMailReplyDrafty(prev) ? { ...prev, subject, dirty: true } : prev));
  }, []);

  const setBody = useCallback((body: string) => {
    setState((prev) => (isMailReplyDrafty(prev) ? { ...prev, body, dirty: true } : prev));
  }, []);

  const openConfirm = useCallback(() => {
    setState((prev) => {
      if (!isMailReplyDrafty(prev) || !prev.body.trim() || !prev.toEmail.trim()) return prev;
      return { ...prev, status: "confirm" };
    });
  }, []);

  const keepEditing = useCallback(() => {
    setState((prev) => (isMailReplyDrafty(prev) ? { ...prev, status: "draft" } : prev));
  }, []);

  const send = useCallback(async (): Promise<boolean> => {
    if (sendingRef.current || !isMailReplyDrafty(state)) return false;
    sendingRef.current = true;
    setState({ ...state, status: "sending", error: null });
    try {
      await sendMailReply({
        draft_token: state.draftToken,
        subject: state.subject,
        body: state.body,
      });
      trackProductEvent(TelemetryEventNames.mailReplySent, {});
      dirtyRef.current = false;
      setState(COLLAPSED);
      return true;
    } catch (err) {
      trackProductEvent(TelemetryEventNames.mailReplyFailed, { error_class: errorClass(err) });
      setState({ ...state, status: "draft", error: failMessage(err, "send") });
      return false;
    } finally {
      sendingRef.current = false;
    }
  }, [failMessage, state]);

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
