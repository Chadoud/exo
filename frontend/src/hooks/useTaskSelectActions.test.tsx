// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../i18n/I18nContext";
import { restoreTask, type Task } from "../api/tasks";
import { applyTasksRemoved } from "../components/tasks/applyTasksRemoved";
import { useTaskSelectActions } from "./useTaskSelectActions";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../components/tasks/applyTasksRemoved", () => ({
  applyTasksRemoved: vi.fn(),
}));
vi.mock("../api/tasks", () => ({
  restoreTask: vi.fn(),
}));

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

type Api = ReturnType<typeof useTaskSelectActions>;

function Harness({
  tasks,
  setTasks,
  selectedIds,
  onReady,
  push,
  undo,
}: {
  tasks: Task[];
  setTasks: (next: Task[]) => void;
  selectedIds: number[];
  onReady: (api: Api) => void;
  push: (entry: { restore: () => Promise<void> }) => void;
  undo: () => Promise<void>;
}) {
  const api = useTaskSelectActions(tasks, setTasks, { selectedIds, clear: vi.fn() }, { push, undo });
  onReady(api);
  return null;
}

describe("useTaskSelectActions undo", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(applyTasksRemoved).mockReset().mockResolvedValue([task(1)]);
    vi.mocked(restoreTask).mockReset().mockImplementation(async (id: number) => task(id));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("restores the last removed task ids", async () => {
    const tasks = [task(1), task(2)];
    const setTasks = vi.fn();
    const push = vi.fn();
    let api: Api | undefined;
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <Harness
            tasks={tasks}
            setTasks={setTasks}
            selectedIds={[2]}
            onReady={(next) => { api = next; }}
            push={push}
            undo={vi.fn().mockResolvedValue(undefined)}
          />
        </I18nProvider>,
      );
    });
    await act(async () => {
      await api?.applyRemoved();
    });
    expect(push).toHaveBeenCalledTimes(1);
    const entry = push.mock.calls[0][0] as { restore: () => Promise<void> };
    await act(async () => {
      await entry.restore();
    });
    expect(restoreTask).toHaveBeenCalledWith(2);
    expect(setTasks).toHaveBeenLastCalledWith([task(2), task(1)]);
  });
});
