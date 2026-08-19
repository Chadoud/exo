import { useEffect, useId, useMemo, useRef, type KeyboardEvent } from "react";
import { useI18n } from "../../i18n/I18nContext";
import {
  isMailReplyDrafty,
  useMailReplyReview,
  type MailReplyReviewState,
} from "../../hooks/useMailReplyReview";
import { useMailReplyOriginal, type OriginalView } from "../../hooks/useMailReplyOriginal";
import type { MailReplyItem } from "../../api/mailReplies";
import MailReplyDraftFields from "./MailReplyDraftFields";
import MailReplyOriginalBlock from "./MailReplyOriginalBlock";
import MailReplySendConfirm from "./MailReplySendConfirm";
import InboxSelectCheck from "./InboxSelectCheck";

interface MailReplyCardProps {
  item: MailReplyItem;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onSent: (displayName: string) => void;
  onCollapse: () => void;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

function displayName(item: MailReplyItem, fallback: string): string {
  return item.from_name.trim() || item.from_local_part.trim() || fallback;
}

function errorText(state: MailReplyReviewState): string | null {
  if (isMailReplyDrafty(state)) return state.error;
  return null;
}

function originalFailCopy(
  view: OriginalView,
  t: (key: string) => string,
): string {
  if (view.kind !== "failed") return t("todo.inbox.mailReply.originalFailed");
  if (view.fail === "disconnected") return t("todo.inbox.mailReply.originalFailedDisconnected");
  if (view.fail === "offline") return t("todo.inbox.mailReply.originalFailedOffline");
  if (view.fail === "gone") return t("todo.inbox.mailReply.originalGone");
  return t("todo.inbox.mailReply.originalFailed");
}

export default function MailReplyCard({
  item,
  expanded,
  onToggle,
  onDismiss,
  onSent,
  onCollapse,
  selecting = false,
  selected = false,
  onSelect,
}: MailReplyCardProps) {
  const { t } = useI18n();
  const regionId = useId();
  const waitingId = useId();
  const originalHeadingId = useId();
  const originalRegionId = useId();
  const wasExpanded = useRef(expanded);
  const name = displayName(item, t("todo.inbox.mailReply.thisSender"));
  const seed = useMemo(
    () => ({
      subject: item.draft_subject,
      body: item.draft_body,
      toName: item.from_name.trim() || name,
    }),
    [item.draft_body, item.draft_subject, item.from_name, name],
  );
  const { state, review, collapse, setSubject, setBody, openConfirm, keepEditing, send } =
    useMailReplyReview(
      item.id,
      {
        threadChanged: t("todo.inbox.mailReply.threadChanged"),
        sendFailed: t("todo.inbox.mailReply.sendFailed"),
        checkFailed: t("todo.inbox.mailReply.checkFailed"),
      },
      seed,
    );
  const original = useMailReplyOriginal(item.id);

  const sending = state.status === "sending";
  const checking = isMailReplyDrafty(state) && state.check === "pending";
  const open = expanded || state.status !== "collapsed";
  const drafty = isMailReplyDrafty(state);
  const alertText = errorText(state);
  const liveStatus = sending
    ? t("todo.inbox.mailReply.sending")
    : checking && state.status === "confirm"
      ? t("todo.inbox.mailReply.checking")
      : "";
  const hideLabel = t("todo.inbox.mailReply.dismissAria");
  const preview = item.draft_body.trim();
  const sendBlocked =
    sending ||
    !drafty ||
    !state.body.trim() ||
    state.block !== "none" ||
    (state.check !== "ok" && state.status !== "confirm");

  useEffect(() => {
    if (wasExpanded.current && !expanded && state.status !== "collapsed") collapse();
    wasExpanded.current = expanded;
  }, [collapse, expanded, state.status]);

  useEffect(() => {
    if (selecting) {
      original.hide();
      if (open) {
        collapse();
        onCollapse();
      }
    }
    // hide/collapse only when entering select — open/original identity is stable enough
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selecting is the trigger
  }, [selecting]);

  const closeCard = () => {
    collapse();
    original.hide();
    onCollapse();
  };

  const handleReview = () => {
    if (sending) return;
    if (open) {
      closeCard();
      return;
    }
    onToggle();
    original.show();
    void review();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    if (state.status === "confirm" || sending) return;
    if (open) {
      closeCard();
      return;
    }
    if (original.open) original.hide();
  };

  const hasSavedDraft = Boolean(item.draft_body.trim() || item.draft_subject.trim());
  const showActions = !selecting;
  const showReview = showActions && (hasSavedDraft || open);

  return (
    <li className="flex items-start gap-2" onKeyDown={handleKeyDown}>
      {onSelect ? (
        <InboxSelectCheck selected={selected} label={name} onSelect={onSelect} />
      ) : null}
      <div
        className={`min-w-0 flex-1 rounded-xl border px-4 py-3 ${
          selected ? "border-accent bg-accent/10" : "border-border bg-bg-secondary"
        }`}
      >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </p>
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => onSelect?.()} className="min-w-0 flex-1 text-left">
          <p id={waitingId} className="text-sm font-medium text-text-primary">
            {t("todo.inbox.mailReply.waiting", { name })}
          </p>
          <p className="mt-1 text-xs text-muted leading-relaxed">{item.subject}</p>
          {!drafty ? (
            preview ? (
              <div className="mt-2">
                <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
                  {t("todo.inbox.mailReply.draftPreviewLabel")}
                </p>
                <p className="mt-1 text-xs text-text-secondary leading-relaxed line-clamp-2">{preview}</p>
              </div>
            ) : (
              <p className="mt-1 text-2xs text-muted leading-snug">{t("todo.inbox.mailReply.readyLine")}</p>
            )
          ) : null}
        </button>
        {showActions ? (
        <button
          type="button"
          title={t("todo.inbox.mailReply.dismissTitle")}
          onClick={() => onDismiss()}
          disabled={sending}
          className="shrink-0 rounded p-1 text-muted hover:text-text-primary min-h-8 min-w-8"
          aria-label={hideLabel}
        >
          <svg className="h-3.5 w-3.5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        ) : null}
      </div>
      {showActions ? (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={original.toggle}
          disabled={sending}
          aria-expanded={original.open}
          aria-controls={originalRegionId}
          className="min-h-8 text-xs font-medium text-accent hover:underline"
        >
          {original.open
            ? t("todo.inbox.mailReply.originalToggleHide")
            : t("todo.inbox.mailReply.originalToggleShow")}
        </button>
        {showReview ? (
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
        ) : null}
      </div>
      ) : null}
      {showActions && original.open ? (
        <div className="mt-3">
          <MailReplyOriginalBlock
            view={original.view}
            headingId={originalHeadingId}
            regionId={originalRegionId}
            heading={t("todo.inbox.mailReply.originalHeading")}
            loading={t("todo.inbox.mailReply.originalLoading")}
            empty={t("todo.inbox.mailReply.originalEmpty")}
            truncated={t("todo.inbox.mailReply.originalTruncated")}
            failed={originalFailCopy(original.view, t)}
            retryLabel={t("todo.inbox.mailReply.retry")}
            onRetry={() => void original.retry()}
          />
        </div>
      ) : null}
      {showActions && open ? (
        <div
          id={regionId}
          role="region"
          aria-labelledby={waitingId}
          aria-busy={sending}
          className="mt-3 space-y-3 border-t border-border pt-3"
        >
          {sending ? <p className="text-xs text-muted">{t("todo.inbox.mailReply.sending")}</p> : null}
          {alertText ? (
            <p role="alert" className="text-xs text-red-400">
              {alertText}
            </p>
          ) : null}
          {drafty && state.block !== "none" ? (
            <button
              type="button"
              onClick={() => void review()}
              disabled={sending}
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
                hasRecipient={Boolean(state.toEmail.trim()) || state.check === "pending"}
                disabled={sending}
                onSubjectChange={setSubject}
                onBodyChange={setBody}
                onOpenConfirm={openConfirm}
              />
              {checking && !state.toEmail.trim() ? (
                <p className="text-2xs text-muted">{t("todo.inbox.mailReply.checking")}</p>
              ) : null}
              <button
                type="button"
                onClick={openConfirm}
                disabled={sendBlocked || !state.toEmail.trim()}
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
          confirmDisabled={state.check === "pending"}
          statusText={state.check === "pending" ? t("todo.inbox.mailReply.checking") : undefined}
          onCancel={keepEditing}
          onConfirm={() => {
            void send().then((ok) => {
              if (ok) onSent(name);
            });
          }}
        />
      ) : null}
      </div>
    </li>
  );
}
