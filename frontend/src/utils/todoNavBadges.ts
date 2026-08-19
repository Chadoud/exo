import type { MainNavItem } from "../hooks/useMainNavItems";
import type { TodoFeedCounts } from "../hooks/useTodoFeed";

function formatBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count > 99 ? "99+" : String(count);
}

function badgeForTab(tab: string | undefined, counts: TodoFeedCounts): string | undefined {
  if (tab === "today") return formatBadge(counts.open + Math.max(0, counts.replies));
  if (tab === "inbox") return formatBadge(counts.inbox);
  if (tab === "done") return formatBadge(counts.done);
  return undefined;
}

/** Attach a count on every To Do sidebar child from the live feed. */
export function applyTodoNavBadges(items: MainNavItem[], counts: TodoFeedCounts): MainNavItem[] {
  if (!counts.loaded) return items;

  return items.map((item) => {
    if (item.id !== "tasks" || !item.children?.length) return item;
    return {
      ...item,
      children: item.children.map((child) => ({
        ...child,
        badge: badgeForTab(child.todoSubTab, counts),
      })),
    };
  });
}
