import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { useI18n } from "../../i18n/I18nContext";
import {
  isMailReplyDrafty,
  useMailReplyReview,
  type MailReplyReviewState,
} from "../../hooks/useMailReplyReview";
import type { MailReplyItem } from "../../api/mailReplies";
import MailReplyDraftFields from "./MailReplyDraftFields";
import MailReplySendConfirm from "./MailReplySendConfirm";

interface MailReplyCardProps {
  item: MailReplyItem;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onSent: (displayName: string) => void;
  onCollapse: () => void;
}

function displayName(item: MailReplyItem, fallback: string): string {
  return item.from_name.trim() || item.from_local_part.trim() || fallback;
}

function errorText(state: MailReplyReviewState): string | null {
  if (state.status === "error") return state.error;
  if (isMailReplyDrafty(state)) return state.error;
  return null;
}

export default function MailReplyCard({
  item,
  expanded,
  onToggle,
  onDismiss,
  onSent,
  onCollapse,
}: MailReplyCardProps) {
  const { t } = useI18n();
  const regionId = useId();
  const waitingId = useId();
  const wasExpanded = useRef(expanded);
  const name = displayName(item, t("todo.inbox.mailReply.thisSender"));
  const { state, review, collapse, setSubject, setBody, openConfirm, keepEditing, send } =
    useMailReplyReview(item.id, {
      threadChanged: t("todo.inbox.mailReply.threadChanged"),
      sendFailed: t("todo.inbox.mailReply.sendFailed"),
      draftFailed: t("todo.inbox.mailReply.draftFailed"),
      draftDiscarded: t("todo.inbox.mailReply.draftDiscarded"),
    });

  const working = state.status === "working";
  const sending = state.status === "sending";
  const open = expanded || state.status !== "collapsed";
  const drafty = isMailReplyDrafty(state);
  const alertText = errorText(state);
  const liveStatus = working
    ? t("todo.inbox.mailReply.reading")
    : sending
      ? t("todo.inbox.mailReply.sending")
      : "";
  const hideLabel = t("todo.inbox.mailReply.dismissAria");

  useEffect(() => {
    if (wasExpanded.current && !expanded && state.status !== "collapsed") collapse();
    wasExpanded.current = expanded;
  }, [collapse, expanded, state.status]);

  const closeCard = () => {
    collapse();
    onCollapse();
  };

  const handleReview = () => {
    if (sending) return;
    if (open) {
      closeCard();
      return;
    }
    onToggle();
    void review();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (state.status === "confirm" || sending) return;
    if (open) closeCard();
  };

  return (
    <li className="rounded-xl border border-border bg-bg-secondary px-4 py-3" onKeyDown={handleKeyDown}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p id={waitingId} className="text-sm font-medium text-text-primary">
            {t("todo.inbox.mailReply.waiting", { name })}
          </p>
          <p className="mt-1 text-xs text-muted leading-relaxed">{item.subject}</p>
          {!drafty ? (
            <p className="mt-1 text-2xs text-muted leading-snug">{t("todo.inbox.mailReply.willDraft")}</p>
          ) : null}
        </div>
        <button
          type="button"
          title={t("todo.inbox.mailReply.dismissTitle")}
          onClick={() => onDismiss()}
          disabled={working || sending}
          className="shrink-0 rounded p-1 text-muted hover:text-text-primary min-h-8 min-w-8"
          aria-label={hideLabel}
        >
          <svg className="h-3.5 w-3.5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          id={`mail-reply-review-${item.id}`}
          type="button"
          onClick={handleReview}
          disabled={sending}
          aria-expanded={open}
          aria-controls={regionId}
          className="min-h-8 rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {open ? t("todo.inbox.mailReply.closeReview") : t("todo.inbox.mailReply.review")}
        </button>
      </div>
      {open ? (
        <div
          id={regionId}
          role="region"
          aria-labelledby={waitingId}
          aria-busy={working || sending}
          className="mt-3 space-y-3 border-t border-border pt-3"
        >
          {working ? <p className="text-xs text-muted">{t("todo.inbox.mailReply.reading")}</p> : null}
          {sending ? <p className="text-xs text-muted">{t("todo.inbox.mailReply.sending")}</p> : null}
          {alertText ? (
            <p role="alert" className="text-xs text-red-400">
              {alertText}
            </p>
          ) : null}
          {state.status === "error" ? (
            <button
              type="button"
              onClick={() => void review()}
              className="min-h-8 text-xs font-medium text-accent hover:underline"
            >
              {t("todo.inbox.mailReply.retry")}
            </button>
          ) : null}
          {drafty ? (
            <>
              <p className="text-xs text-text-secondary">
                {t("todo.inbox.mailReply.toLine", { name: state.toName || name })}
              </p>
              <MailReplyDraftFields
                subject={state.subject}
                body={state.body}
                subjectLabel={t("todo.inbox.mailReply.subjectLabel")}
                bodyLabel={t("todo.inbox.mailReply.bodyLabel")}
                emptyBodyHint={t("todo.inbox.mailReply.emptyBody")}
                noRecipient={t("todo.inbox.mailReply.noRecipient")}
                hasRecipient={Boolean(state.toEmail.trim())}
                disabled={sending}
                onSubjectChange={setSubject}
                onBodyChange={setBody}
                onOpenConfirm={openConfirm}
              />
              {state.llmFailed ? (
                <button
                  type="button"
                  onClick={() => void review()}
                  disabled={sending}
                  className="min-h-8 text-xs font-medium text-accent hover:underline"
                >
                  {t("todo.inbox.mailReply.retry")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={openConfirm}
                disabled={sending || !state.body.trim() || !state.toEmail.trim()}
                className="min-h-8 rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {t("todo.inbox.mailReply.send")}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {state.status === "confirm" && drafty ? (
        <MailReplySendConfirm
          title={t("todo.inbox.mailReply.confirmTitle")}
          body={t("todo.inbox.mailReply.confirmBody", { name, email: state.toEmail })}
          confirmLabel={t("todo.inbox.mailReply.send")}
          cancelLabel={t("todo.inbox.mailReply.keepEditing")}
          onCancel={keepEditing}
          onConfirm={() => {
            void send().then((ok) => {
              if (ok) onSent(name);
            });
          }}
        />
      ) : null}
    </li>
  );
}
