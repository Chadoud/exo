import { describe, expect, it, vi } from "vitest";
import { announceTaskSync } from "./taskSyncToast";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  message: vi.fn(),
}));

vi.mock("sonner", () => ({ toast }));

const copy = {
  foundOne: "Found 1",
  foundOther: "Found n",
  none: "No new items",
  notConnected: "Connect accounts",
  connectLabel: "External sources",
};

describe("announceTaskSync", () => {
  it("toasts new items", () => {
    announceTaskSync({ total_created: 2, statuses: { gmail: "ok" } }, copy);
    expect(toast.success).toHaveBeenCalledWith("Found n");
  });

  it("toasts a quiet none when accounts are connected", () => {
    announceTaskSync({ total_created: 0, statuses: { gmail: "ok" } }, copy);
    expect(toast.message).toHaveBeenCalledWith("No new items");
  });

  it("offers External sources when nothing is connected", () => {
    const onOpenSources = vi.fn();
    announceTaskSync(
      { total_created: 0, statuses: { gmail: "not_connected", outlook: "not_connected" } },
      copy,
      onOpenSources,
    );
    expect(toast.message).toHaveBeenCalledWith("Connect accounts", {
      action: { label: "External sources", onClick: onOpenSources },
    });
  });
});
