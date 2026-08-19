import { describe, expect, it } from "vitest";
import { pickTodoLandingTab, resolveAttentionNavigation } from "./todoNavigation";

describe("pickTodoLandingTab", () => {
  it("keeps the last tab when nothing needs you", () => {
    expect(pickTodoLandingTab("today", { inbox: 0 })).toBe("today");
    expect(pickTodoLandingTab("done", { inbox: 0 })).toBe("done");
  });

  it("opens Needs you when it has work", () => {
    expect(pickTodoLandingTab("inbox", { inbox: 2 })).toBe("inbox");
    expect(pickTodoLandingTab("today", { inbox: 3 })).toBe("inbox");
    expect(pickTodoLandingTab("done", { inbox: 1 })).toBe("inbox");
  });

  it("keeps the last tab until feed counts load", () => {
    expect(pickTodoLandingTab("today", { inbox: 0, loaded: false })).toBe("today");
  });
});

describe("resolveAttentionNavigation", () => {
  it("routes memory review to filtered memories", () => {
    expect(
      resolveAttentionNavigation({
        key: "memory",
        title: "Review",
        kind: "memory_review",
        nudgeIds: [],
      }),
    ).toEqual({ tab: "memories", filter: "needsReview" });
  });

  it("routes failed agent tasks to inbox", () => {
    expect(
      resolveAttentionNavigation({
        key: "fail",
        title: "Review recent failed tasks",
        kind: "nudge",
        nudgeIds: [1],
      }),
    ).toEqual({ tab: "tasks", subTab: "inbox" });
  });

  it("routes due tasks to today", () => {
    expect(
      resolveAttentionNavigation({
        key: "due",
        title: "Prep",
        kind: "task_due",
        nudgeIds: [2],
      }),
    ).toEqual({ tab: "tasks", subTab: "today" });
  });
});
