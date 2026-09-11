// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nContext";
import StartupTodayPane from "./StartupTodayPane";

vi.mock("../../api/proactive", () => ({
  fetchLatestDigest: vi.fn(async () => null),
  fetchNudges: vi.fn(async () => []),
  generateDigest: vi.fn(),
  dismissNudge: vi.fn(),
  dismissAllNudges: vi.fn(),
}));

describe("StartupTodayPane", () => {
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

  it("fires Open To Do from the text link", async () => {
    const onOpenTodo = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <StartupTodayPane backendOnline onOpenTodo={onOpenTodo} />
        </I18nProvider>,
      );
    });
    const button = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("Open To Do"),
    );
    await act(async () => {
      button!.click();
    });
    expect(onOpenTodo).toHaveBeenCalledTimes(1);
    expect(button?.className).toContain("text-accent");
    expect(button?.className).not.toContain("bg-button-primary");
  });

  it("shows the upgrade card when the tier is locked", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <StartupTodayPane backendOnline proAllowed={false} onOpenTodo={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Trial ended");
    expect(container.textContent).toContain("automatic daily digest");
  });

  it("does not render leftover list lanes or digest heading", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <StartupTodayPane backendOnline onOpenTodo={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).not.toContain("Meetings today");
    expect(container.textContent).not.toContain("Unread mail");
    expect(container.textContent).not.toContain("Open tasks");
    expect(container.textContent).not.toContain("Open External sources");
    expect(container.textContent).not.toContain("Written digest");
  });

  it("shows a digest line when offline instead of a blank hole", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <StartupTodayPane backendOnline={false} onOpenTodo={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("The written summary will show when you're connected.");
    expect(container.textContent).toContain("Open To Do");
  });
});
