import { useMemo } from "react";
import { collectInboxKeys } from "../utils/inboxKeys";
import type { TodoFeedInbox } from "./useTodoFeed";
import type { TodoSubTab } from "../utils/todoUi";

type Args = {
  proLocked: boolean;
  subTab: TodoSubTab;
  showAllSections: boolean;
  taskSelecting: boolean;
  inboxSelecting: boolean;
  visibleTaskIds: number[];
  inbox: TodoFeedInbox;
  enterTasks: () => void;
};

export function shouldShowTodoHeaderSelect(opts: {
  proLocked: boolean;
  taskSelecting: boolean;
  inboxSelecting: boolean;
  onAttentionTab: boolean;
  tasksCanSelect: boolean;
}): boolean {
  return (
    !opts.proLocked &&
    !opts.taskSelecting &&
    !opts.inboxSelecting &&
    !opts.onAttentionTab &&
    opts.tasksCanSelect
  );
}

/** Header Select is Tasks/Done only — Needs you already shows row checks. */
export function useTodoSelectHeader({
  proLocked,
  subTab,
  showAllSections,
  taskSelecting,
  inboxSelecting,
  visibleTaskIds,
  inbox,
  enterTasks,
}: Args) {
  const pendingKeys = useMemo(() => collectInboxKeys(inbox, { mail: false }), [inbox]);
  const replyKeys = useMemo(
    () => collectInboxKeys(inbox, { failures: false, nudges: false, mail: true }),
    [inbox],
  );
  const inboxKeys = pendingKeys;
  const onAttentionTab = subTab === "inbox";
  const tasksCanSelect = visibleTaskIds.length > 0 && (showAllSections || !onAttentionTab);
  const showSelect = shouldShowTodoHeaderSelect({
    proLocked,
    taskSelecting,
    inboxSelecting,
    onAttentionTab,
    tasksCanSelect,
  });
  const onHeaderSelect = () => enterTasks();
  return { inboxKeys, pendingKeys, replyKeys, showSelect, onHeaderSelect };
}
