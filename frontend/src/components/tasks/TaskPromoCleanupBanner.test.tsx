// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TaskPromoCleanupBanner from "./TaskPromoCleanupBanner";

describe("TaskPromoCleanupBanner", () => {
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

  it("hides when there is nothing to remove", async () => {
    await act(async () => {
      root.render(
        <TaskPromoCleanupBanner count={0} message="x" actionLabel="Remove" onRemove={() => {}} />,
      );
    });
    expect(container.textContent).toBe("");
  });

  it("shows the count on the list and runs remove", async () => {
    const onRemove = vi.fn();
    await act(async () => {
      root.render(
        <TaskPromoCleanupBanner
          count={3}
          message="3 mail tasks look like promotions — they can leave your list."
          actionLabel="Remove promotional mail tasks"
          onRemove={onRemove}
        />,
      );
    });
    expect(container.textContent).toContain("3 mail tasks look like promotions");
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Remove promotional mail tasks");
    await act(async () => {
      button?.click();
    });
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
