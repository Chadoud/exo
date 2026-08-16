// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TaskPanelHeaderActions from "./TaskPanelHeaderActions";

describe("TaskPanelHeaderActions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("runs Select when tasks can be chosen", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <TaskPanelHeaderActions
          showSelect
          selectLabel="Select"
          onSelect={onSelect}
          showSync={false}
          syncDisabled={false}
          syncLabel="Sync"
          syncTitle=""
          onSync={() => {}}
        />,
      );
    });
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
