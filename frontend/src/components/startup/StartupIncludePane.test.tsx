// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nContext";
import StartupIncludePane from "./StartupIncludePane";

const fetchMemory = vi.fn();
const upsertMemoryEntry = vi.fn();

vi.mock("../../api/memory", () => ({
  fetchMemory: (...args: unknown[]) => fetchMemory(...args),
  upsertMemoryEntry: (...args: unknown[]) => upsertMemoryEntry(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

describe("StartupIncludePane", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchMemory.mockReset();
    upsertMemoryEntry.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not treat a failed load as saved defaults", async () => {
    fetchMemory.mockRejectedValue(new Error("offline"));
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <StartupIncludePane backendOnline />
        </I18nProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Couldn't load what to include.");
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("reverts a toggle when save fails", async () => {
    fetchMemory.mockResolvedValue({
      preferences: { startup_routine: "calendar and email" },
    });
    upsertMemoryEntry.mockRejectedValue(new Error("save"));
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <StartupIncludePane backendOnline />
        </I18nProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    const calendar = container.querySelectorAll('input[type="checkbox"]')[0] as HTMLInputElement;
    expect(calendar.checked).toBe(true);
    await act(async () => {
      calendar.click();
    });
    expect(calendar.checked).toBe(true);
  });

  it("describes calendar and mail as spoken-brief only", async () => {
    fetchMemory.mockResolvedValue({ preferences: {} });
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <StartupIncludePane backendOnline />
        </I18nProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Turn on only what you want Exo to say in the spoken brief.");
    expect(container.textContent).toContain("Meetings in the spoken brief.");
    expect(container.textContent).toContain("Important unread mail in the spoken brief.");
    expect(container.textContent).not.toContain("Unread mail from connected inboxes.");
  });
});
