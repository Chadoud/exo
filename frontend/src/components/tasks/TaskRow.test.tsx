// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import type { Task } from "../../api/tasks";
import TaskRow from "./TaskRow";

const task: Task = {
  id: 7,
  description: "Call the landlord",
  due_at: null,
  priority: "normal",
  completed: false,
  completed_at: null,
  source: "assistant",
  source_conversation_id: null,
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
};

describe("TaskRow", () => {
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

  function mount(
    onToggle: () => void,
    onSelect: () => void,
    extras: { selecting?: boolean; selected?: boolean } = {},
  ) {
    act(() => {
      root.render(
        <I18nProvider locale="en">
          <ul>
            <TaskRow
              task={task}
              sourceBadge={{ label: "Assistant", tone: "" }}
              dueDisplay="none"
              onToggle={onToggle}
              onSelect={onSelect}
              selecting={extras.selecting}
              selected={extras.selected}
            />
          </ul>
        </I18nProvider>,
      );
    });
  }

  it("row body click selects and does not complete", () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    mount(onToggle, onSelect);
    act(() => {
      container.querySelector("p")?.closest("button")?.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("checkbox completes when not selecting", () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    mount(onToggle, onSelect);
    const checkbox = container.querySelector("button");
    act(() => {
      checkbox?.click();
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("checkbox selects while selecting", () => {
    const onToggle = vi.fn();
    const onSelect = vi.fn();
    mount(onToggle, onSelect, { selecting: true, selected: false });
    const checkbox = container.querySelector("button");
    act(() => {
      checkbox?.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
