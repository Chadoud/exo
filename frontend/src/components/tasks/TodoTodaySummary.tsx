import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nContext";

type TodoTodaySummaryProps = {
  overdueCount: number;
  dueTodayCount: number;
  inboxCount: number;
  undatedCount?: number;
  onOpenInbox: () => void;
  onScrollToOverdue?: () => void;
  onScrollToToday?: () => void;
};

/** One-line Today summary — counts only, no card chrome. */
export default function TodoTodaySummary({
  overdueCount,
  dueTodayCount,
  inboxCount,
  undatedCount = 0,
  onOpenInbox,
  onScrollToOverdue,
  onScrollToToday,
}: TodoTodaySummaryProps) {
  const { t } = useI18n();

  const segments: ReactNode[] = [];

  if (overdueCount > 0) {
    segments.push(
      onScrollToOverdue ? (
        <button
          key="overdue"
          type="button"
          onClick={onScrollToOverdue}
          className="font-medium text-red-400/90 hover:underline"
        >
          {t("todo.todaySummary.overdue", { n: overdueCount })}
        </button>
      ) : (
        <span key="overdue" className="font-medium text-red-400/90">
          {t("todo.todaySummary.overdue", { n: overdueCount })}
        </span>
      ),
    );
  }

  if (dueTodayCount > 0) {
    segments.push(
      onScrollToToday ? (
        <button
          key="today"
          type="button"
          onClick={onScrollToToday}
          className="font-medium text-text-primary hover:underline"
        >
          {t("todo.todaySummary.dueToday", { n: dueTodayCount })}
        </button>
      ) : (
        <span key="today" className="font-medium text-text-primary">
          {t("todo.todaySummary.dueToday", { n: dueTodayCount })}
        </span>
      ),
    );
  }

  if (undatedCount > 0) {
    segments.push(
      <span key="undated" className="text-text-primary">
        {t("todo.todaySummary.undatedMail", { n: undatedCount })}
      </span>,
    );
  }

  if (segments.length === 0) {
    segments.push(
      <span key="clear" className="text-text-primary">
        {t("todo.todaySummary.clear")}
      </span>,
    );
  }

  return (
    <p className="mb-4 text-sm text-muted">
      {segments.map((segment, index) => (
        <span key={index}>
          {index > 0 ? <span aria-hidden> · </span> : null}
          {segment}
        </span>
      ))}
      {inboxCount > 0 ? (
        <>
          <span aria-hidden> · </span>
          <button
            type="button"
            onClick={onOpenInbox}
            className="font-medium text-warning hover:underline"
          >
            {t("todo.todaySummary.inboxLink", { n: inboxCount })}
          </button>
        </>
      ) : null}
    </p>
  );
}
