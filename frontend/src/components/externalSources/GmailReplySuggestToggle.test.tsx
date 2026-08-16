// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import GmailReplySuggestToggle from "./GmailReplySuggestToggle";

vi.mock("../../api/mailReplies", () => ({
  fetchMailReplySettings: vi.fn(async () => ({ enabled: true })),
  fetchMailReplies: vi.fn(async () => ({
    items: [],
    enabled: true,
    can_send: true,
    gated_reason: null,
  })),
  patchMailReplySettings: vi.fn(async (enabled: boolean) => ({ enabled })),
}));

describe("GmailReplySuggestToggle", () => {
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

  it("renders the Gmail-card toggle and disables when disconnected", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <GmailReplySuggestToggle connected={false} backendOnline />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Suggest replies");
    const box = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(container.textContent).toContain("Connect Gmail");
  });

  it("explains Inbox plus first-check wait when Gmail is connected", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <GmailReplySuggestToggle connected backendOnline />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Inbox shows who is waiting");
    expect(container.textContent).toContain("First check can take a few minutes.");
  });
});
