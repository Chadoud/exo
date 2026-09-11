import type { ReactNode } from "react";
import type { Task } from "../../api/tasks";
import type { DueDayGroup } from "../../utils/taskBuckets";
import EmptyState from "../ui/EmptyState";
import ListSkeleton from "../ui/ListSkeleton";
import TodoTaskTimeline from "./TodoTaskTimeline";
import TodoUpcomingLater from "./TodoUpcomingLater";

type TodoOpenTasksBodyProps = {
  proLocked: boolean;
  loading: boolean;
  hasLoadedTasks: boolean;
  hasAnyOpenTasks: boolean;
  todayHasTasks: boolean;
  hasUpcomingContent: boolean;
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

/** Open Tasks list — Brief lives under Memory. */
export default function TodoOpenTasksBody({
  proLocked,
  loading,
  hasLoadedTasks,
  hasAnyOpenTasks,
  todayHasTasks,
  hasUpcomingContent,
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

  if (loading && !hasLoadedTasks) {
    return <ListSkeleton />;
  }
  const hasReadyLane = Boolean(unmatchedReplies) || (mailHarvesting && Boolean(readingLabel));
  if (!loading && !hasAnyOpenTasks && !hasReadyLane) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDesc}
        primaryAction={{ label: syncLabel, onClick: onSync }}
      />
    );
  }

  return (
    <>
      {todayHasTasks ? (
        <TodoTaskTimeline mode="today" dueGroups={todayDayGroups} renderTask={renderTask} />
      ) : null}
      {hasUpcomingContent ? (
        <div className={todayHasTasks ? "mt-6" : undefined}>
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
