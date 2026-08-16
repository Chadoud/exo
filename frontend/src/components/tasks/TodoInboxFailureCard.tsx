import type { AgentFailure } from "../../api/proactive";
import { parseAgentFailureContent } from "../../utils/agentFailureContent";

interface TodoInboxFailureCardProps {
  failure: AgentFailure;
  onRetry: () => void;
  onDismiss: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export default function TodoInboxFailureCard({
  failure,
  onRetry,
  onDismiss,
  t,
}: TodoInboxFailureCardProps) {
  const parsed = parseAgentFailureContent(failure.content);
  const timestamp = new Date(failure.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-3">
        {parsed.goal ? (
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-red-300/90">
              {t("todo.inbox.failureGoalLabel")}
            </p>
            <p className="mt-1 text-sm font-medium text-text-primary leading-snug">{parsed.goal}</p>
          </div>
        ) : null}
        {parsed.outcome ? (
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">
              {t("todo.inbox.failureOutcomeLabel")}
            </p>
            <p className="mt-1 text-sm text-text-secondary leading-relaxed">{parsed.outcome}</p>
          </div>
        ) : !parsed.goal ? (
          <p className="text-sm text-text-primary whitespace-pre-wrap leading-snug">{parsed.raw}</p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-muted">{timestamp}</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
          >
            {t("todo.inbox.retryInChat")}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-muted hover:text-text-primary"
        aria-label={t("todo.inbox.failureDismissAria")}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}
