import { beforeEach, describe, expect, it, vi } from "vitest";

const forgetIntegrationTasks = vi.fn();
const resumeIntegrationSource = vi.fn();
const syncTasksFromIntegrations = vi.fn();

vi.mock("../api/mailReplies", () => ({
  refreshMailReplies: vi.fn(),
}));

vi.mock("../api/tasks", () => ({
  forgetIntegrationTasks: (...args: unknown[]) => forgetIntegrationTasks(...args),
  resumeIntegrationSource: (...args: unknown[]) => resumeIntegrationSource(...args),
  syncTasksFromIntegrations: (...args: unknown[]) => syncTasksFromIntegrations(...args),
}));

import {
  forgetIntegrationSourcesBestEffort,
  resumeIntegrationSourcesBestEffort,
} from "./forgetIntegrationTasks";

describe("forgetIntegrationSourcesBestEffort", () => {
  beforeEach(() => {
    forgetIntegrationTasks.mockReset();
    resumeIntegrationSource.mockReset();
    syncTasksFromIntegrations.mockReset();
  });

  it("calls forget for each source", async () => {
    forgetIntegrationTasks.mockResolvedValue({ ok: true, dropped: 2 });
    await forgetIntegrationSourcesBestEffort(["gmail", "google-calendar"]);
    expect(forgetIntegrationTasks).toHaveBeenCalledWith("gmail");
    expect(forgetIntegrationTasks).toHaveBeenCalledWith("google-calendar");
  });

  it("resumes each source after reconnect", async () => {
    resumeIntegrationSource.mockResolvedValue({ ok: true });
    resumeIntegrationSourcesBestEffort(["gmail", "google-calendar"]);
    await vi.waitFor(() => {
      expect(resumeIntegrationSource).toHaveBeenCalledWith("gmail");
      expect(resumeIntegrationSource).toHaveBeenCalledWith("google-calendar");
    });
  });

  it("continues when one source fails", async () => {
    forgetIntegrationTasks
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, dropped: 0 });
    await forgetIntegrationSourcesBestEffort(["gmail", "outlook"]);
    expect(forgetIntegrationTasks).toHaveBeenCalledTimes(2);
  });
});
