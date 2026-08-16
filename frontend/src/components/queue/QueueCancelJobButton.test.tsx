// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import { QueueCancelJobButton } from "./QueueCancelJobButton";

describe("QueueCancelJobButton", () => {
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

  const render = async (onCancel: () => Promise<void>) => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <QueueCancelJobButton onCancel={onCancel} />
        </I18nProvider>,
      );
    });
  };

  const triggerButton = () => container.querySelector("button") as HTMLButtonElement;
  const dialog = () => document.querySelector('[role="dialog"]');
  const findButtonByText = (text: string) =>
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent === text) as HTMLButtonElement;

  it("asks for confirmation before cancelling the sort", async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    await render(onCancel);

    await act(async () => {
      triggerButton().click();
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
    expect(document.body.textContent).toContain("Cancel this sort?");
    expect(document.body.textContent).toContain("Files already sorted will be moved back");
  });

  it("does not cancel when the user keeps sorting", async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    await render(onCancel);

    await act(async () => {
      triggerButton().click();
    });
    await act(async () => {
      findButtonByText("Keep sorting").click();
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("cancels only after the user confirms", async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    await render(onCancel);

    await act(async () => {
      triggerButton().click();
    });
    await act(async () => {
      findButtonByText("Cancel sort").click();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });

  it("dismisses without cancelling when closed via Escape", async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    await render(onCancel);

    await act(async () => {
      triggerButton().click();
    });
    expect(dialog()).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});
