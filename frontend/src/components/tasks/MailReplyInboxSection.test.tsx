// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import { draftMailReply, type MailReplyItem } from "../../api/mailReplies";
import MailReplyInboxSection from "./MailReplyInboxSection";
import TodoInboxSection from "./TodoInboxSection";
import type { TodoFeedInbox } from "../../hooks/useTodoFeed";

vi.mock("sonner", () => ({ toast: { message: vi.fn(), error: vi.fn() } }));
vi.mock("../../telemetry/assistantTelemetry", () => ({ trackProductEvent: vi.fn() }));
vi.mock("../../api/mailReplies", () => ({
  draftMailReply: vi.fn(),
  sendMailReply: vi.fn(),
}));

const item = (id: number, name: string): MailReplyItem => ({
  id,
  from_name: name,
  from_local_part: name.toLowerCase(),
  subject: "Lunch?",
  created_at: "2026-08-15T10:00:00Z",
});

describe("MailReplyInboxSection", () => {
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

  it("renders waiting cards and has no dismiss-all", async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MailReplyInboxSection items={[item(1, "Ada")]} onDismiss={onDismiss} onSent={vi.fn()} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Ada is waiting");
    expect(container.textContent).toContain("Lunch?");
    expect(container.textContent).not.toContain("Dismiss all");
    const review = container.querySelector("#mail-reply-review-1") as HTMLButtonElement;
    expect(review.getAttribute("aria-expanded")).toBe("false");
    expect(review.textContent).toBe("Write a reply");
    expect(container.textContent).toContain("Exo will read this thread and draft a reply.");
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    const dismiss = container.querySelector('[aria-label="Hide this waiting email for 2 weeks"]');
    expect(dismiss).toBeTruthy();
  });

  it("keeps the card open with an alert when the first draft fails", async () => {
    vi.mocked(draftMailReply).mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MailReplyInboxSection items={[item(1, "Ada")]} onDismiss={vi.fn()} onSent={vi.fn()} />
        </I18nProvider>,
      );
    });
    const review = container.querySelector("#mail-reply-review-1") as HTMLButtonElement;
    await act(async () => {
      review.click();
      await Promise.resolve();
    });
    expect(review.getAttribute("aria-expanded")).toBe("true");
    expect(review.textContent).toBe("Close");
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't write this reply");
    expect(container.textContent).toContain("Retry");
    expect(review.disabled).toBe(false);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute("aria-label")).toBeNull();
    expect(region?.getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("keeps Close enabled while writing a reply", async () => {
    let resolveDraft!: (value: {
      draft_token: string;
      to_name: string;
      to_email: string;
      subject: string;
      body: string;
    }) => void;
    vi.mocked(draftMailReply).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve;
        }),
    );
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MailReplyInboxSection items={[item(1, "Ada")]} onDismiss={vi.fn()} onSent={vi.fn()} />
        </I18nProvider>,
      );
    });
    const review = container.querySelector("#mail-reply-review-1") as HTMLButtonElement;
    await act(async () => {
      review.click();
      await Promise.resolve();
    });
    expect(review.textContent).toBe("Close");
    expect(review.disabled).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Working on a reply");
    await act(async () => {
      resolveDraft({
        draft_token: "tok",
        to_name: "Ada",
        to_email: "ada@example.com",
        subject: "Re: Lunch?",
        body: "See you at noon.",
      });
      await Promise.resolve();
    });
    expect(container.textContent).toContain("To: Ada");
    expect(container.textContent).not.toContain("Exo will read this thread and draft a reply.");
  });
});

describe("TodoInboxSection mail group", () => {
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

  it("places needs-reply after failures and stays quiet when gated empty", async () => {
    const inbox: TodoFeedInbox = {
      nudges: [],
      failures: [
        {
          id: 9,
          content: "goal: x\noutcome: y",
          created_at: "2026-08-15T10:00:00Z",
        },
      ],
      needsReview: 0,
      mailReplies: [item(1, "Ada")],
      loading: false,
    };
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxSection
            inbox={inbox}
            onDismissNudge={vi.fn()}
            onDismissAllNudges={vi.fn()}
            onDismissFailure={vi.fn()}
            onDismissMailReply={vi.fn()}
            onMailReplySent={vi.fn()}
            onOpenMemoryReview={vi.fn()}
            onOpenToday={vi.fn()}
            onOpenChat={vi.fn()}
            onRetryFailureInChat={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    const text = container.textContent || "";
    expect(text.indexOf("Needs your help")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Ada is waiting")).toBeGreaterThan(text.indexOf("Needs your help"));

    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxSection
            inbox={{ ...inbox, failures: [], mailReplies: [], needsReview: 0 }}
            onDismissNudge={vi.fn()}
            onDismissAllNudges={vi.fn()}
            onDismissFailure={vi.fn()}
            onDismissMailReply={vi.fn()}
            onMailReplySent={vi.fn()}
            onOpenMemoryReview={vi.fn()}
            onOpenToday={vi.fn()}
            onOpenChat={vi.fn()}
            onRetryFailureInChat={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Inbox clear");
    expect(container.textContent).not.toContain("is waiting");
  });
});
