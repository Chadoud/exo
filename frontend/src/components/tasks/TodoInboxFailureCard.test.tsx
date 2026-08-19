// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import TodoInboxFailureCard from "./TodoInboxFailureCard";

const failure = {
  id: 9,
  content: "Goal: deploy the site\nOutcome: Timed out.\nMissing deploy scope.",
  created_at: "2026-08-15T10:00:00Z",
};

function t(key: string): string {
  const map: Record<string, string> = {
    "todo.inbox.failureGoalLabel": "What you asked for",
    "todo.inbox.failureOutcomeLabel": "What went wrong",
    "todo.inbox.retryInChat": "Retry in Chat",
    "todo.inbox.failureDismissAria": "Remove from inbox",
    "todo.inbox.failureShowWhatHappened": "Show what happened",
    "todo.inbox.failureHideWhatHappened": "Hide",
    "todo.inbox.failureWhyFallback": "Couldn't finish this.",
  };
  return map[key] ?? key;
}

describe("TodoInboxFailureCard", () => {
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

  it("starts collapsed with a one-line why and Retry visible", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxFailureCard
            failure={failure}
            t={t}
            onRetry={vi.fn()}
            onDismiss={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    const text = container.textContent || "";
    expect(text).toContain("deploy the site");
    expect(text).toContain("Timed out.");
    expect(text).not.toContain("What went wrong");
    expect(text).not.toContain("Missing deploy scope.");
    expect(text).toContain("Retry in Chat");
    expect(text).toContain("Show what happened");
    expect(container.querySelector('[aria-label="Remove from inbox"]')).toBeTruthy();
  });

  it("reveals the full outcome and keeps Retry", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxFailureCard
            failure={failure}
            t={t}
            onRetry={vi.fn()}
            onDismiss={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    await act(async () => {
      const show = Array.from(container.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("Show what happened"),
      );
      show?.click();
    });
    expect(container.textContent).toContain("What went wrong");
    expect(container.textContent).toContain("Missing deploy scope.");
    expect(container.textContent).toContain("Hide");
    expect(container.textContent).toContain("Retry in Chat");
    await act(async () => {
      const hide = Array.from(container.querySelectorAll("button")).find((btn) =>
        btn.textContent === "Hide",
      );
      hide?.click();
    });
    expect(container.textContent).not.toContain("What went wrong");
  });

  it("shows the checkbox before select mode when the row can be selected", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxFailureCard
            failure={failure}
            t={t}
            onSelect={vi.fn()}
            onRetry={vi.fn()}
            onDismiss={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(container.querySelector('[aria-pressed]')).toBeTruthy();
    expect(container.textContent).toContain("Retry in Chat");
  });

  it("keeps the select checkbox outside the colored card", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxFailureCard
            failure={failure}
            t={t}
            selecting
            onSelect={vi.fn()}
            onRetry={vi.fn()}
            onDismiss={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    const checkbox = container.querySelector('[aria-pressed]');
    const card = container.querySelector(".rounded-xl");
    expect(checkbox).toBeTruthy();
    expect(card?.contains(checkbox)).toBe(false);
  });

  it("hides Retry, dismiss, and disclosure while selecting", async () => {
    const onSelect = vi.fn();
    const onDismiss = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxFailureCard
            failure={failure}
            t={t}
            selecting
            onSelect={onSelect}
            onRetry={vi.fn()}
            onDismiss={onDismiss}
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).not.toContain("Retry in Chat");
    expect(container.textContent).not.toContain("Show what happened");
    expect(container.querySelector('[aria-label="Remove from inbox"]')).toBeNull();
    await act(async () => {
      const title = Array.from(container.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("deploy the site"),
      );
      title?.click();
    });
    expect(onSelect).toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
