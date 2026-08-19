// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import TodayBriefingCard from "./TodayBriefingCard";

vi.mock("../DailyBriefing", () => ({
  default: () => <p>3 conversations, 0 tasks done, 2 still open</p>,
}));

describe("TodayBriefingCard", () => {
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

  it("shows the briefing open with no accordion", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodayBriefingCard backendOnline />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Briefing");
    expect(container.textContent).toContain("3 conversations, 0 tasks done, 2 still open");
    expect(container.querySelector("[aria-expanded]")).toBeNull();
    expect(container.textContent).not.toContain("Generate");
  });
});
