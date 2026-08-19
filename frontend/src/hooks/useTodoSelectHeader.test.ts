import { describe, expect, it } from "vitest";
import { shouldShowTodoHeaderSelect } from "./useTodoSelectHeader";

describe("shouldShowTodoHeaderSelect", () => {
  const base = {
    proLocked: false,
    taskSelecting: false,
    inboxSelecting: false,
    onAttentionTab: false,
    tasksCanSelect: true,
  };

  it("hides Select on Needs you", () => {
    expect(shouldShowTodoHeaderSelect({ ...base, onAttentionTab: true })).toBe(false);
  });

  it("shows Select on Tasks when rows can be selected", () => {
    expect(shouldShowTodoHeaderSelect(base)).toBe(true);
  });
});
