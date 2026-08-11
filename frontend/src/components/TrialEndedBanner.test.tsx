// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TrialEndedBanner from "./TrialEndedBanner";
import { I18nProvider } from "../i18n/I18nContext";

describe("TrialEndedBanner", () => {
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

  it("explains what is paused and routes 'See plans' to the caller", async () => {
    const onSeePlans = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TrialEndedBanner onSeePlans={onSeePlans} />
        </I18nProvider>,
      );
    });

    expect(container.textContent).toContain("AI sorting, voice and sync are paused");

    const seePlans = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "See plans",
    ) as HTMLButtonElement;
    await act(async () => {
      seePlans.click();
    });
    expect(onSeePlans).toHaveBeenCalledTimes(1);
  });
});
