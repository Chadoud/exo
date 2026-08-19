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
  saveMailReplyDraft: vi.fn(),
  sendMailReply: vi.fn(),
  fetchMailReplyOriginal: vi.fn(async () => ({ text: "Are you free Thursday?", truncated: false })),
}));

const item = (id: number, name: string): MailReplyItem => ({
  id,
  from_name: name,
  from_local_part: name.toLowerCase(),
  subject: "Lunch?",
  created_at: "2026-08-15T10:00:00Z",
  draft_subject: "Re: Lunch?",
  draft_body: "See you at noon.",
});

const sectionProps = {
  onDismissNudge: vi.fn(),
  onDismissAllNudges: vi.fn(),
  onDismissFailure: vi.fn(),
  onOpenMemoryReview: vi.fn(),
  onOpenToday: vi.fn(),
  onOpenChat: vi.fn(),
  onRetryFailureInChat: vi.fn(),
};

function inboxOf(partial: Partial<TodoFeedInbox>): TodoFeedInbox {
  return {
    nudges: [],
    failures: [],
    needsReview: 0,
    mailReplies: [],
    mailRepliesLicensed: false,
    loading: false,
    ...partial,
  };
}

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
    expect(container.textContent).toContain("Your draft");
    expect(container.textContent).toContain("Show their message");
    expect(container.textContent).not.toContain("Dismiss all");
    const review = container.querySelector("#mail-reply-review-1") as HTMLButtonElement;
    expect(review.getAttribute("aria-expanded")).toBe("false");
    expect(review.textContent).toBe("Review reply");
    expect(container.textContent).toContain("See you at noon.");
    expect(container.textContent).not.toContain("Exo will read this thread and draft a reply.");
    expect(container.querySelector('[role="status"]')).toBeTruthy();
    const dismiss = container.querySelector('[aria-label="Hide this waiting email for 2 weeks"]');
    expect(dismiss).toBeTruthy();
    const chrome = container.querySelector(".rounded-xl");
    expect(chrome?.querySelector('[aria-label="Ada"]')).toBeFalsy();
  });

  it("shows the checkbox before select mode when the row can be selected", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MailReplyInboxSection
            items={[item(1, "Ada")]}
            onDismiss={vi.fn()}
            onSent={vi.fn()}
            onSelect={vi.fn()}
          />
        </I18nProvider>,
      );
    });
    const check = container.querySelector('[aria-label="Ada"]');
    expect(check).toBeTruthy();
    expect(container.textContent).toContain("Review reply");
  });

  it("keeps the checkbox outside the card fill like Pending and Tasks", async () => {
    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MailReplyInboxSection
            items={[item(1, "Ada")]}
            onDismiss={vi.fn()}
            onSent={vi.fn()}
            selecting
            isSelected={() => true}
            onSelect={onSelect}
          />
        </I18nProvider>,
      );
    });
    const row = container.querySelector("li");
    const chrome = row?.querySelector(".rounded-xl");
    const check = row?.querySelector('[aria-label="Ada"]') ?? null;
    expect(check).toBeTruthy();
    expect(chrome?.contains(check)).toBe(false);
    expect(row?.contains(check)).toBe(true);
  });

  it("opens their message on the card without leaving To Do", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <MailReplyInboxSection items={[item(1, "Ada")]} onDismiss={vi.fn()} onSent={vi.fn()} />
        </I18nProvider>,
      );
    });
    const show = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Show their message"),
    );
    expect(show?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => {
      show?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Are you free Thursday?");
    expect(container.textContent).toContain("Their message");
    expect(container.textContent).toContain("Hide their message");
  });

  it("keeps the card open with the saved reply when mint fails", async () => {
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
    expect(alert?.textContent).toContain("Couldn't get this ready to send");
    expect(container.textContent).toContain("See you at noon.");
    expect(container.textContent).toContain("Retry");
    expect(review.disabled).toBe(false);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute("aria-label")).toBeNull();
    expect(region?.getAttribute("aria-labelledby")).toBeTruthy();
  });

  it("keeps Close enabled while checking the thread", async () => {
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
    expect(container.textContent).toContain("See you at noon.");
    expect(container.textContent).not.toContain("Working on a reply");
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

describe("TodoInboxSection pending lanes", () => {
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

  it("keeps mail reply cards off Pending even when drafts exist", async () => {
    const inbox = inboxOf({
      failures: [
        {
          id: 9,
          content: "Goal: x\nOutcome: y",
          created_at: "2026-08-15T10:00:00Z",
        },
      ],
      mailReplies: [item(1, "Ada")],
      mailRepliesLicensed: true,
    });
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxSection inbox={inbox} {...sectionProps} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Needs your help");
    expect(container.textContent).not.toContain("Ada is waiting");
    expect(container.textContent).not.toContain("Waiting on a reply");
  });

  it("treats mail-only feed as Pending empty", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxSection
            inbox={inboxOf({ mailReplies: [item(1, "Ada")], mailRepliesLicensed: true })}
            {...sectionProps}
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Nothing needs you");
    expect(container.textContent).not.toContain("Ada is waiting");
  });

  it("shows Nothing needs you when every pending lane is empty", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxSection inbox={inboxOf({ mailRepliesLicensed: true })} {...sectionProps} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Nothing needs you");
    expect(container.textContent).not.toContain("No one is waiting on a reply");
  });

  it("shows a skeleton while loading with nothing to list", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxSection inbox={inboxOf({ loading: true })} {...sectionProps} />
        </I18nProvider>,
      );
    });
    expect(container.querySelector("[aria-hidden]")).toBeTruthy();
    expect(container.textContent).not.toContain("Checking mail");
    expect(container.textContent).not.toContain("Nothing needs you");
  });

  it("selects a failure row on title tap and does not dismiss", async () => {
    const onSelect = vi.fn();
    const onDismissFailure = vi.fn();
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoInboxSection
            inbox={inboxOf({
              failures: [{ id: 9, content: "Goal: deploy\nOutcome: timed out", created_at: "2026-08-15T10:00:00Z" }],
            })}
            {...sectionProps}
            onDismissFailure={onDismissFailure}
            onSelect={onSelect}
          />
        </I18nProvider>,
      );
    });
    expect(container.querySelector('[aria-pressed]')).toBeTruthy();
    await act(async () => {
      const title = Array.from(container.querySelectorAll("button")).find((btn) =>
        btn.textContent?.includes("deploy"),
      );
      title?.click();
    });
    expect(onSelect).toHaveBeenCalledWith("failure:9");
    expect(onDismissFailure).not.toHaveBeenCalled();
  });
});
