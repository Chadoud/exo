import { useCallback, useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { fetchTasks, type Task } from "../api/tasks";
import TaskMailReplyBlock from "../components/tasks/TaskMailReplyBlock";
import TaskRow from "../components/tasks/TaskRow";
import { taskSourceBadge } from "../components/tasks/taskSourceBadge";
import type { InboxRestoreItem } from "../utils/restoreInboxItems";
import { mailReplyForTask, unmatchedMailReplies } from "../utils/taskMailReply";
import { taskMayHaveOpenTarget } from "../utils/memoryOrigin";
import { useTasksMailHarvest } from "./useTasksMailHarvest";
import type { MailReplyItem } from "../api/mailReplies";

type Args = {
  backendOnline: boolean;
  harvestEnabled: boolean;
  refreshFeed: (opts?: { silent?: boolean }) => Promise<void>;
  setTasks: Dispatch<SetStateAction<Task[]>>;
  tasks: Task[];
  mailReplies: MailReplyItem[];
  t: (key: string) => string;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  isSelected: (id: number) => boolean;
  selecting: boolean;
  openSource: (task: Task) => void;
  openBusyTaskId: number | null;
  dismissMail: (items: InboxRestoreItem[]) => Promise<void>;
};

export function useTasksPanelMail({
  backendOnline,
  harvestEnabled,
  refreshFeed,
  setTasks,
  tasks,
  mailReplies,
  t,
  onToggle,
  onSelect,
  isSelected,
  selecting,
  openSource,
  openBusyTaskId,
  dismissMail,
}: Args) {
  const onMailHarvested = useCallback(
    async (opts?: { silent?: boolean }) => {
      await refreshFeed(opts);
      if (!backendOnline) return;
      try {
        const next = await fetchTasks(true);
        setTasks(next);
      } catch {
        /* keep the list we already have */
      }
    },
    [backendOnline, refreshFeed, setTasks],
  );
  const mailHarvesting = useTasksMailHarvest(harvestEnabled, onMailHarvested);
  const unmatchedReplies = useMemo(
    () => unmatchedMailReplies(tasks, mailReplies),
    [tasks, mailReplies],
  );

  const renderTaskRow = (task: Task, dueDisplay: "grouped" | "full" | "none"): ReactNode => {
    const reply = mailReplyForTask(task, mailReplies);
    return (
      <TaskRow
        key={task.id}
        task={task}
        sourceBadge={taskSourceBadge(task.source, t)}
        dueDisplay={dueDisplay}
        onToggle={onToggle}
        onSelect={onSelect}
        selected={isSelected(task.id)}
        selecting={selecting}
        onOpenSource={taskMayHaveOpenTarget(task) ? openSource : undefined}
        openBusy={openBusyTaskId === task.id}
        replySlot={
          reply ? (
            <TaskMailReplyBlock
              item={reply}
              onDismiss={() => void dismissMail([{ kind: "mail", id: reply.id }])}
              onSent={() => void onMailHarvested({ silent: true })}
            />
          ) : null
        }
      />
    );
  };

  return { mailHarvesting, unmatchedReplies, renderTaskRow, onMailHarvested };
}
