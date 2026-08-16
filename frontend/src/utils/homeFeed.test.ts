import { describe, expect, it } from "vitest";
import {
  buildHomeAttentionFromNudges,
  countInboxAttentionItems,
  filterInboxNudges,
  formatNudgeBody,
} from "./homeFeed";

describe("formatNudgeBody", () => {
  it("replaces ISO due timestamps with locale-friendly text", () => {
    const body = "Due 2026-06-13T12:00:00+02:00.";
    const out = formatNudgeBody(body);
    expect(out).not.toContain("2026-06-13T12:00:00");
    expect(out.startsWith("Due ")).toBe(true);
  });
});

describe("buildHomeAttentionFromNudges", () => {
  it("groups repetitive meeting prep reminders", () => {
    const items = buildHomeAttentionFromNudges([
      {
        id: 1,
        kind: "task_due",
        title: "Task due soon: Prepare for: Snack",
        body: "Due 2026-06-13T12:00:00+02:00.",
        meta: {},
        dismissed: false,
        created_at: "",
      },
      {
        id: 2,
        kind: "task_due",
        title: "Task due soon: Prepare for: WORK",
        body: "Due 2026-06-13T14:00:00+02:00.",
        meta: {},
        dismissed: false,
        created_at: "",
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].nudgeIds).toEqual([1, 2]);
    expect(items[0].body).toContain("Snack");
    expect(items[0].body).toContain("WORK");
  });

  it("merges duplicate nudge titles", () => {
    const items = buildHomeAttentionFromNudges([
      {
        id: 1,
        kind: "nudge",
        title: "Review recent failed tasks",
        body: "1 recent task(s) failed.",
        meta: {},
        dismissed: false,
        created_at: "",
      },
      {
        id: 2,
        kind: "nudge",
        title: "Review recent failed tasks",
        body: "1 recent task(s) failed.",
        meta: {},
        dismissed: false,
        created_at: "",
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].nudgeIds).toEqual([1, 2]);
  });
});

describe("filterInboxNudges", () => {
  it("drops failed-task nudges when failures are already listed", () => {
    const nudges = [
      {
        id: 1,
        kind: "nudge",
        title: "Review recent failed tasks",
        body: "",
        meta: {},
        dismissed: false,
        created_at: "",
      },
      {
        id: 2,
        kind: "nudge",
        title: "Other reminder",
        body: "",
        meta: {},
        dismissed: false,
        created_at: "",
      },
    ];
    expect(filterInboxNudges(nudges, 1)).toHaveLength(1);
    expect(filterInboxNudges(nudges, 1)[0].title).toBe("Other reminder");
  });
});

describe("countInboxAttentionItems", () => {
  it("includes visible mail-reply cards in the inbox badge", () => {
    const withoutMail = countInboxAttentionItems([], [], 0, 0);
    const withMail = countInboxAttentionItems([], [], 0, 2);
    expect(withoutMail).toBe(0);
    expect(withMail).toBe(2);
  });
});
