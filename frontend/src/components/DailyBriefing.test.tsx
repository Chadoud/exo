// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../i18n/I18nContext";
import DailyBriefing from "./DailyBriefing";

vi.mock("../api/proactive", () => ({
  fetchLatestDigest: vi.fn(async () => ({
    id: 1,
    date: "2026-08-17",
    created_at: "2026-08-17T07:00:00Z",
    headline: "3 conversations, 0 tasks done, 2 still open",
    highlights: ["Board pack is due at 10:30"],
    decisions: ["Keep the Friday slot"],
    unresolved: [],
    focus_tomorrow: [],
  })),
  fetchNudges: vi.fn(async () => []),
  generateDigest: vi.fn(),
  dismissNudge: vi.fn(),
  dismissAllNudges: vi.fn(),
}));

describe("DailyBriefing", () => {
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

  it("shows the digest open with no Generate or Details control", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <DailyBriefing backendOnline embedded showNudges={false} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("3 conversations, 0 tasks done, 2 still open");
    expect(container.textContent).toContain("Board pack is due at 10:30");
    expect(container.textContent).toContain("Keep the Friday slot");
    expect(container.textContent).toContain("Refresh");
    expect(container.textContent).not.toContain("Generate");
    expect(container.textContent).not.toContain("Details");
    expect(container.querySelector("[aria-expanded]")).toBeNull();
  });
});
