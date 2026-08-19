import { useEffect, useId, useState, type KeyboardEvent } from "react";
import type { AgentFailure } from "../../api/proactive";
import { oneLineFailureWhy, parseAgentFailureContent } from "../../utils/agentFailureContent";
import InboxSelectCheck from "./InboxSelectCheck";

interface TodoInboxFailureCardProps {
  failure: AgentFailure;
  onRetry: () => void;
  onDismiss: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  selecting?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}

function formatFailureTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function selectAriaLabel(goal: string, why: string): string {
  const first = goal.trim().split(/\n/, 1)[0]?.trim() ?? "";
  return first || why;
}

function FailureCardScan({
  goal,
  goalLabel,
  why,
  timestamp,
  clampAsk,
  showWhy,
}: {
  goal: string;
  goalLabel: string;
  why: string;
  timestamp: string;
  clampAsk: boolean;
  showWhy: boolean;
}) {
  return (
    <>
      {goal ? (
        <span className="block">
          <span className="block text-2xs font-semibold uppercase tracking-wide text-red-300/90">
            {goalLabel}
          </span>
          <span
            className={`mt-1 block text-sm font-medium text-text-primary leading-snug ${
              clampAsk ? "line-clamp-1" : ""
            }`}
          >
            {goal}
          </span>
        </span>
      ) : null}
      {showWhy ? (
        <span className="block text-sm text-text-secondary leading-relaxed line-clamp-1">{why}</span>
      ) : null}
      <span className="block pt-1 text-[11px] text-muted">{timestamp}</span>
    </>
  );
}

export default function TodoInboxFailureCard({
  failure,
  onRetry,
  onDismiss,
  t,
  selecting = false,
  selected = false,
  onSelect,
}: TodoInboxFailureCardProps) {
  const parsed = parseAgentFailureContent(failure.content);
  const why = oneLineFailureWhy(parsed.outcome) || t("todo.inbox.failureWhyFallback");
  const canExpand = Boolean(parsed.outcome.trim());
  const [expanded, setExpanded] = useState(false);
  const open = expanded && !selecting && canExpand;
  const regionId = useId();
  const outcomeLabelId = useId();

  useEffect(() => {
    if (selecting) setExpanded(false);
  }, [selecting]);

  const onCardKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setExpanded(false);
  };

  const cardTone = selected
    ? "border-accent bg-accent/10"
    : "border-red-500/30 bg-red-500/5";

  return (
    <li className="flex items-start gap-2" onKeyDown={onCardKeyDown}>
      {onSelect ? (
        <InboxSelectCheck
          selected={selected}
          label={selectAriaLabel(parsed.goal, why)}
          onSelect={onSelect}
        />
      ) : null}
      <div className={`flex min-w-0 flex-1 items-start gap-2 rounded-xl border px-4 py-3 ${cardTone}`}>
      <div className="min-w-0 flex-1">
        {onSelect ? (
          <button type="button" onClick={onSelect} className="w-full space-y-3 text-left">
            <FailureCardScan
              goal={parsed.goal}
              goalLabel={t("todo.inbox.failureGoalLabel")}
              why={why}
              timestamp={formatFailureTime(failure.created_at)}
              clampAsk={!canExpand}
              showWhy={!open}
            />
          </button>
        ) : (
          <div className="space-y-3">
            <FailureCardScan
              goal={parsed.goal}
              goalLabel={t("todo.inbox.failureGoalLabel")}
              why={why}
              timestamp={formatFailureTime(failure.created_at)}
              clampAsk={!canExpand}
              showWhy={!open}
            />
          </div>
        )}
        {canExpand && !selecting ? (
          <button
            type="button"
            className="mt-2 min-h-8 text-xs font-medium text-accent hover:underline"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => setExpanded((current) => !current)}
          >
            {open ? t("todo.inbox.failureHideWhatHappened") : t("todo.inbox.failureShowWhatHappened")}
          </button>
        ) : null}
        {open ? (
          <div id={regionId} role="region" aria-labelledby={outcomeLabelId} className="mt-2">
            <p id={outcomeLabelId} className="text-2xs font-semibold uppercase tracking-wide text-muted">
              {t("todo.inbox.failureOutcomeLabel")}
            </p>
            <p className="mt-1 text-sm text-text-secondary leading-relaxed">{parsed.outcome}</p>
          </div>
        ) : null}
      </div>
      {selecting ? null : (
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-1 text-muted hover:text-text-primary"
            aria-label={t("todo.inbox.failureDismissAria")}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-button-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
          >
            {t("todo.inbox.retryInChat")}
          </button>
        </div>
      )}
      </div>
    </li>
  );
}
