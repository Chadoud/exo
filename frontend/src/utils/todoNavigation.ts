import type { HomeAttentionItem } from "./homeFeed";
import { FAILED_TASKS_NUDGE_TITLE } from "./homeFeed";
import type { TodoSubTab } from "./todoUi";

type TodoNavigationTarget = {
  tab: "tasks";
  subTab: TodoSubTab;
  highlightTaskId?: number;
};

type MemoryNavigationTarget = {
  tab: "memories";
  filter: "needsReview";
};

type AttentionNavigationTarget =
  | TodoNavigationTarget
  | MemoryNavigationTarget
  | { tab: "assistant" }
  | { tab: "queue" };

/** Parent To Do click: stay on last tab unless Needs you has work. */
export function pickTodoLandingTab(
  last: TodoSubTab,
  counts: { inbox: number; replies?: number; loaded?: boolean },
): TodoSubTab {
  if (counts.loaded === false) return last;
  if (Math.max(0, counts.inbox) > 0) return "inbox";
  return last;
}

/** Map a home/inbox attention row to the screen where its content actually lives. */
export function resolveAttentionNavigation(item: HomeAttentionItem): AttentionNavigationTarget {
  if (item.kind === "memory_review") {
    return { tab: "memories", filter: "needsReview" };
  }
  if (item.kind === "task_due") {
    return { tab: "tasks", subTab: "today" };
  }
  if (FAILED_TASKS_NUDGE_TITLE.test(item.title)) {
    return { tab: "tasks", subTab: "inbox" };
  }
  return { tab: "tasks", subTab: "inbox" };
}
