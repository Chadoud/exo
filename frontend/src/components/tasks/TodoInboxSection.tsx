import type { AgentFailure } from "../../api/proactive";
import EmptyState from "../ui/EmptyState";
import ListSkeleton from "../ui/ListSkeleton";
import { useI18n } from "../../i18n/I18nContext";
import {
  buildAgentFailureRetryPrompt,
  parseAgentFailureContent,
} from "../../utils/agentFailureContent";
import {
  buildHomeAttentionFromNudges,
  filterInboxNudges,
} from "../../utils/homeFeed";
import type { TodoFeedInbox } from "../../hooks/useTodoFeed";
import TodoInboxFailureCard from "./TodoInboxFailureCard";
import MailReplyInboxSection from "./MailReplyInboxSection";

interface TodoInboxSectionProps {
  inbox: TodoFeedInbox;
  onDismissNudge: (id: number) => Promise<void>;
  onDismissAllNudges: () => Promise<void>;
  onDismissFailure: (id: number) => Promise<void>;
  onDismissMailReply: (id: number) => Promise<void>;
  onMailReplySent: () => void;
  onOpenMemoryReview: () => void;
  onOpenToday: () => void;
  onOpenChat: () => void;
  onRetryFailureInChat: (prompt: string, failureId: number) => void;
}

export default function TodoInboxSection({
  inbox,
  onDismissNudge,
  onDismissAllNudges,
  onDismissFailure,
  onDismissMailReply,
  onMailReplySent,
  onOpenMemoryReview,
  onOpenToday,
  onOpenChat,
  onRetryFailureInChat,
}: TodoInboxSectionProps) {
  const { t } = useI18n();
  const { nudges, failures, needsReview, mailReplies, loading } = inbox;

  const visibleNudges = filterInboxNudges(nudges, failures.length);
  const groupedNudges = buildHomeAttentionFromNudges(visibleNudges, 20);
  const isEmpty =
    !loading &&
    failures.length === 0 &&
    needsReview === 0 &&
    mailReplies.length === 0 &&
    groupedNudges.length === 0;

  if (loading && nudges.length === 0 && failures.length === 0 && mailReplies.length === 0) {
    return <ListSkeleton />;
  }

  if (isEmpty) {
    return (
      <EmptyState
        title={t("todo.inbox.emptyTitle")}
        description={t("todo.inbox.emptyDesc")}
        primaryAction={{ label: t("todo.inbox.openToday"), onClick: onOpenToday }}
      />
    );
  }

  const handleNudgeClick = (item: (typeof groupedNudges)[number]) => {
    if (item.kind === "task_due") {
      onOpenToday();
      return;
    }
    onOpenChat();
  };

  return (
    <div className="space-y-6">
      {failures.length > 0 ? (
        <section className="space-y-3" aria-labelledby="todo-inbox-failures-heading">
          <div>
            <h3 id="todo-inbox-failures-heading" className="text-sm font-semibold text-text-primary">
              {t("todo.inbox.failuresHeading", { n: failures.length })}
            </h3>
            <p className="mt-1 text-xs text-muted leading-relaxed">{t("todo.inbox.failuresHint")}</p>
          </div>
          <ul className="space-y-2">
            {failures.map((failure: AgentFailure) => (
              <TodoInboxFailureCard
                key={failure.id}
                failure={failure}
                t={t}
                onRetry={() => {
                  onRetryFailureInChat(
                    buildAgentFailureRetryPrompt(parseAgentFailureContent(failure.content)),
                    failure.id,
                  );
                }}
                onDismiss={() => void onDismissFailure(failure.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <MailReplyInboxSection
        items={mailReplies}
        onDismiss={onDismissMailReply}
        onSent={onMailReplySent}
      />

      {needsReview > 0 ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <button type="button" onClick={onOpenMemoryReview} className="w-full text-left group">
            <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
              {t("home.needsReview").replace("{count}", String(needsReview))}
            </p>
            <p className="mt-1 text-xs text-muted leading-relaxed">{t("home.needsReviewHint")}</p>
            <span className="mt-2 inline-block text-xs font-medium text-accent">
              {t("todo.inbox.reviewMemoriesCta")}
            </span>
          </button>
        </section>
      ) : null}

      {groupedNudges.length > 0 ? (
        <section className="space-y-3" aria-labelledby="todo-inbox-nudges-heading">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 id="todo-inbox-nudges-heading" className="text-sm font-semibold text-text-primary">
                {t("todo.inbox.suggestionsHeading")}
              </h3>
              <p className="mt-1 text-xs text-muted">{t("todo.inbox.suggestionsHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => void onDismissAllNudges()}
              className="shrink-0 text-2xs text-muted hover:text-text-primary hover:underline"
            >
              {t("briefing.dismissAll")}
            </button>
          </div>
          <ul className="space-y-2">
            {groupedNudges.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-2 rounded-xl border border-border bg-bg-secondary px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => handleNudgeClick(item)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-medium text-text-primary">{item.title}</p>
                  {item.body ? (
                    <p className="mt-1 text-xs text-muted leading-relaxed">{item.body}</p>
                  ) : null}
                  {item.kind === "task_due" ? (
                    <span className="mt-2 inline-block text-xs font-medium text-accent">
                      {t("todo.inbox.openTodayCta")}
                    </span>
                  ) : null}
                </button>
                {item.nudgeIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => void Promise.all(item.nudgeIds.map((id: number) => onDismissNudge(id)))}
                    className="shrink-0 rounded p-1 text-muted hover:text-text-primary"
                    aria-label={t("briefing.dismissAria")}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
