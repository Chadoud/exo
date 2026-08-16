// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import TaskSelectBar from "./TaskSelectBar";

describe("TaskSelectBar", () => {
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

  it("exposes a toolbar and disables done actions when nothing is selected", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TaskSelectBar
            selectedCount={0}
            onMarkDone={() => {}}
            onMarkNotDone={() => {}}
            onRemove={() => {}}
            onSelectAll={() => {}}
            onCancel={() => {}}
          />
        </I18nProvider>,
      );
    });
    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar).toBeTruthy();
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons[0]?.textContent).toBe("Mark complete");
    expect(buttons[0]?.hasAttribute("disabled")).toBe(true);
    expect(buttons[1]?.hasAttribute("disabled")).toBe(true);
  });

  it("runs mark complete when a task is selected", async () => {
    const onMarkDone = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TaskSelectBar
            selectedCount={1}
            onMarkDone={onMarkDone}
            onMarkNotDone={() => {}}
            onRemove={() => {}}
            onSelectAll={() => {}}
            onCancel={() => {}}
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("1 selected");
    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(onMarkDone).toHaveBeenCalledOnce();
  });

  it("runs remove when a task is selected", async () => {
    const onRemove = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TaskSelectBar
            selectedCount={1}
            onMarkDone={() => {}}
            onMarkNotDone={() => {}}
            onRemove={onRemove}
            onSelectAll={() => {}}
            onCancel={() => {}}
          />
        </I18nProvider>,
      );
    });
    const remove = [...container.querySelectorAll("button")].find((btn) => btn.textContent === "Remove");
    expect(remove).toBeTruthy();
    await act(async () => {
      remove?.click();
    });
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
