import { beforeEach, describe, expect, it, vi } from "vitest";

const forgetIntegrationTasks = vi.fn();
const syncTasksFromIntegrations = vi.fn();

vi.mock("../api/mailReplies", () => ({
  refreshMailReplies: vi.fn(),
}));

vi.mock("../api/tasks", () => ({
  forgetIntegrationTasks: (...args: unknown[]) => forgetIntegrationTasks(...args),
  syncTasksFromIntegrations: (...args: unknown[]) => syncTasksFromIntegrations(...args),
}));

import { forgetIntegrationSourcesBestEffort } from "./forgetIntegrationTasks";

describe("forgetIntegrationSourcesBestEffort", () => {
  beforeEach(() => {
    forgetIntegrationTasks.mockReset();
    syncTasksFromIntegrations.mockReset();
  });

  it("calls forget for each source", async () => {
    forgetIntegrationTasks.mockResolvedValue({ ok: true, dropped: 2 });
    await forgetIntegrationSourcesBestEffort(["gmail", "google-calendar"]);
    expect(forgetIntegrationTasks).toHaveBeenCalledWith("gmail");
    expect(forgetIntegrationTasks).toHaveBeenCalledWith("google-calendar");
  });

  it("continues when one source fails", async () => {
    forgetIntegrationTasks
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, dropped: 0 });
    await forgetIntegrationSourcesBestEffort(["gmail", "outlook"]);
    expect(forgetIntegrationTasks).toHaveBeenCalledTimes(2);
  });
});
