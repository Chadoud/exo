import type { ReactNode } from "react";
import type { Task } from "../../api/tasks";
import type { DueDayGroup } from "../../utils/taskBuckets";
import EmptyState from "../ui/EmptyState";
import ListSkeleton from "../ui/ListSkeleton";
import TodayBriefingCard from "./TodayBriefingCard";
import TodoTaskTimeline from "./TodoTaskTimeline";
import TodoUpcomingLater from "./TodoUpcomingLater";

type TodoOpenTasksBodyProps = {
  proLocked: boolean;
  loading: boolean;
  hasLoadedTasks: boolean;
  hasAnyOpenTasks: boolean;
  todayHasTasks: boolean;
  hasUpcomingContent: boolean;
  backendOnline: boolean;
  proAllowed?: boolean;
  onUpgrade?: () => void;
  todayDayGroups: DueDayGroup[];
  upcomingDayGroups: DueDayGroup[];
  somedayTasks: Task[];
  laterOpen: boolean;
  onToggleLater: () => void;
  renderTask: (task: Task, dueDisplay: "grouped" | "full" | "none") => ReactNode;
  emptyTitle: string;
  emptyDesc: string;
  syncLabel: string;
  onSync: () => void;
  unmatchedReplies?: ReactNode;
  mailHarvesting?: boolean;
  readingLabel?: string;
  readyRepliesHeading?: string;
};

/** Today list with briefing always first — including empty and first-load. */
export default function TodoOpenTasksBody({
  proLocked,
  loading,
  hasLoadedTasks,
  hasAnyOpenTasks,
  todayHasTasks,
  hasUpcomingContent,
  backendOnline,
  proAllowed,
  onUpgrade,
  todayDayGroups,
  upcomingDayGroups,
  somedayTasks,
  laterOpen,
  onToggleLater,
  renderTask,
  emptyTitle,
  emptyDesc,
  syncLabel,
  onSync,
  unmatchedReplies,
  mailHarvesting = false,
  readingLabel,
  readyRepliesHeading,
}: TodoOpenTasksBodyProps) {
  if (proLocked) return null;

  const briefing = (
    <TodayBriefingCard backendOnline={backendOnline} proAllowed={proAllowed} onUpgrade={onUpgrade} />
  );

  if (loading && !hasLoadedTasks) {
    return (
      <>
        {briefing}
        <div className="mt-6">
          <ListSkeleton />
        </div>
      </>
    );
  }
  const hasReadyLane = Boolean(unmatchedReplies) || (mailHarvesting && Boolean(readingLabel));
  if (loading) return briefing;
  if (!hasAnyOpenTasks && !hasReadyLane) {
    return (
      <>
        {briefing}
        <div className="mt-6">
          <EmptyState
            title={emptyTitle}
            description={emptyDesc}
            primaryAction={{ label: syncLabel, onClick: onSync }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {briefing}
      {todayHasTasks ? (
        <div className="mt-6">
          <TodoTaskTimeline mode="today" dueGroups={todayDayGroups} renderTask={renderTask} />
        </div>
      ) : null}
      {hasUpcomingContent ? (
        <div className="mt-6">
          <TodoUpcomingLater
            showDivider={todayHasTasks}
            dueGroups={upcomingDayGroups}
            somedayTasks={somedayTasks}
            laterOpen={laterOpen}
            onToggleLater={onToggleLater}
            renderTask={renderTask}
          />
        </div>
      ) : null}
      {mailHarvesting && readingLabel ? (
        <p className="mt-4 text-sm text-muted" role="status">
          {readingLabel}
        </p>
      ) : null}
      {unmatchedReplies ? (
        <div className="mt-6 space-y-3">
          {readyRepliesHeading ? (
            <h3 className="text-sm font-semibold text-text-primary">{readyRepliesHeading}</h3>
          ) : null}
          {unmatchedReplies}
        </div>
      ) : null}
    </>
  );
}
