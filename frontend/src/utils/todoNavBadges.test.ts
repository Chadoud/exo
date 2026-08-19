import { describe, expect, it } from "vitest";
import type { MainNavItem } from "../hooks/useMainNavItems";
import { applyTodoNavBadges } from "./todoNavBadges";

const counts = {
  inbox: 7,
  replies: 2,
  today: 4,
  open: 4,
  done: 9,
  loaded: true,
};

function todoParent(): MainNavItem {
  return {
    id: "tasks",
    label: "To Do",
    icon: "x",
    children: [
      { id: "tasks", navKey: "tasks-today", todoSubTab: "today", label: "Tasks", icon: "a" },
      { id: "tasks", navKey: "tasks-inbox", todoSubTab: "inbox", label: "Needs you", icon: "b" },
      { id: "tasks", navKey: "tasks-done", todoSubTab: "done", label: "Done", icon: "d" },
    ],
  };
}

describe("applyTodoNavBadges", () => {
  it("badges every To Do sub-tab from live counts", () => {
    const [todo] = applyTodoNavBadges([todoParent()], counts);
    const byTab = Object.fromEntries(
      (todo.children ?? []).map((child) => [child.todoSubTab, child.badge]),
    );
    expect(byTab.today).toBe("6");
    expect(byTab.inbox).toBe("7");
    expect(byTab.done).toBe("9");
  });

  it("omits a badge when that tab’s count is zero", () => {
    const [todo] = applyTodoNavBadges([todoParent()], {
      ...counts,
      open: 0,
      replies: 0,
      done: 0,
    });
    const byTab = Object.fromEntries(
      (todo.children ?? []).map((child) => [child.todoSubTab, child.badge]),
    );
    expect(byTab.today).toBeUndefined();
    expect(byTab.done).toBeUndefined();
    expect(byTab.inbox).toBe("7");
  });

  it("badges Tasks with unmatched ready-replies when nothing is due", () => {
    const [todo] = applyTodoNavBadges([todoParent()], { ...counts, open: 0, replies: 2 });
    const byTab = Object.fromEntries(
      (todo.children ?? []).map((child) => [child.todoSubTab, child.badge]),
    );
    expect(byTab.today).toBe("2");
  });
});
