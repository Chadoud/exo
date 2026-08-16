import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../api/tasks";
import { applyTasksRemoved } from "./applyTasksRemoved";

vi.mock("../../api/tasks", () => ({
  deleteTask: vi.fn(async () => undefined),
}));

import { deleteTask } from "../../api/tasks";

function task(id: number): Task {
  return {
    id,
    description: `task ${id}`,
    due_at: null,
    priority: "normal",
    completed: false,
    completed_at: null,
    source: "assistant",
    source_conversation_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  };
}

describe("applyTasksRemoved", () => {
  beforeEach(() => {
    vi.mocked(deleteTask).mockClear();
  });

  it("deletes known ids and drops them from the list", async () => {
    const next = await applyTasksRemoved([task(1), task(2)], [2, 99]);
    expect(deleteTask).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledWith(2);
    expect(next.map((item) => item.id)).toEqual([1]);
  });
});
