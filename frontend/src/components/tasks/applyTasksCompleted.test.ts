import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../api/tasks";
import { applyTasksCompleted } from "./applyTasksCompleted";

vi.mock("../../api/tasks", () => ({
  setTaskCompleted: vi.fn(async (id: number, completed: boolean) => ({
    id,
    description: `task ${id}`,
    due_at: null,
    priority: "normal",
    completed,
    completed_at: completed ? "2026-08-14T00:00:00Z" : null,
    source: "assistant",
    source_conversation_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-14T00:00:00Z",
  })),
}));

import { setTaskCompleted } from "../../api/tasks";

function task(id: number, completed: boolean): Task {
  return {
    id,
    description: `task ${id}`,
    due_at: null,
    priority: "normal",
    completed,
    completed_at: completed ? "2026-08-01T00:00:00Z" : null,
    source: "assistant",
    source_conversation_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
}

describe("applyTasksCompleted", () => {
  beforeEach(() => {
    vi.mocked(setTaskCompleted).mockClear();
  });

  it("skips already-correct ids", async () => {
    const next = await applyTasksCompleted([task(1, false), task(2, true)], [1, 2], true);
    expect(setTaskCompleted).toHaveBeenCalledTimes(1);
    expect(setTaskCompleted).toHaveBeenCalledWith(1, true);
    expect(next[0].completed).toBe(true);
    expect(next[1].completed).toBe(true);
  });
});
