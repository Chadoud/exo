import { describe, expect, it } from "vitest";
import { nextSelectedIds } from "./useTaskSelection";

describe("nextSelectedIds", () => {
  it("first select enters; second id adds; same id removes; last exits", () => {
    expect(nextSelectedIds([], 1)).toEqual([1]);
    expect(nextSelectedIds([1], 2)).toEqual([1, 2]);
    expect(nextSelectedIds([1, 2], 1)).toEqual([2]);
    expect(nextSelectedIds([2], 2)).toEqual([]);
  });

  it("works with composite inbox keys", () => {
    expect(nextSelectedIds([], "nudge:12")).toEqual(["nudge:12"]);
    expect(nextSelectedIds(["nudge:12"], "mail:9")).toEqual(["nudge:12", "mail:9"]);
    expect(nextSelectedIds(["nudge:12", "mail:9"], "nudge:12")).toEqual(["mail:9"]);
  });
});
