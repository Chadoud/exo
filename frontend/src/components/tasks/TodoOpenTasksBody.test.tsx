// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "../../i18n/I18nContext";
import TodoOpenTasksBody from "./TodoOpenTasksBody";

const emptyProps = {
  proLocked: false,
  loading: false,
  hasLoadedTasks: false,
  hasAnyOpenTasks: false,
  todayHasTasks: false,
  hasUpcomingContent: false,
  todayDayGroups: [],
  upcomingDayGroups: [],
  somedayTasks: [],
  laterOpen: false,
  onToggleLater: () => {},
  renderTask: () => null,
  emptyTitle: "Nothing open",
  emptyDesc: "Sync accounts to pull tasks.",
  syncLabel: "Sync from accounts",
  onSync: () => {},
};

describe("TodoOpenTasksBody", () => {
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

  it("shows a skeleton on first load without a briefing card", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoOpenTasksBody {...emptyProps} loading hasLoadedTasks={false} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).not.toContain("Briefing");
    expect(container.querySelector("[aria-busy], .animate-pulse, [data-skeleton]")).toBeTruthy();
  });

  it("shows the empty state without a briefing card", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoOpenTasksBody {...emptyProps} />
        </I18nProvider>,
      );
    });
    expect(container.textContent).not.toContain("Briefing");
    expect(container.textContent).toContain("Nothing open");
  });

  it("shows unmatched ready-replies when there are no dated tasks", async () => {
    await act(async () => {
      root.render(
        <I18nProvider locale="en">
          <TodoOpenTasksBody
            {...emptyProps}
            unmatchedReplies={<p>Ready draft</p>}
            readyRepliesHeading="Ready to send"
          />
        </I18nProvider>,
      );
    });
    expect(container.textContent).toContain("Ready draft");
    expect(container.textContent).toContain("Ready to send");
  });
});
