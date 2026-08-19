import { beforeEach, describe, expect, it, vi } from "vitest";
import { restoreAgentFailure, restoreNudge } from "../api/proactive";
import { restoreMailReply } from "../api/mailReplies";
import { restoreInboxItems } from "./restoreInboxItems";

vi.mock("../api/proactive", () => ({
  restoreNudge: vi.fn(),
  restoreAgentFailure: vi.fn(),
}));
vi.mock("../api/mailReplies", () => ({
  restoreMailReply: vi.fn(),
}));

describe("restoreInboxItems", () => {
  beforeEach(() => {
    vi.mocked(restoreNudge).mockReset().mockResolvedValue(undefined);
    vi.mocked(restoreAgentFailure).mockReset().mockResolvedValue(undefined);
    vi.mocked(restoreMailReply).mockReset().mockResolvedValue(undefined);
  });

  it("restores each kind in order", async () => {
    await restoreInboxItems([
      { kind: "nudge", id: 12 },
      { kind: "failure", id: 4 },
      { kind: "mail", id: 9 },
    ]);
    expect(restoreNudge).toHaveBeenCalledWith(12);
    expect(restoreAgentFailure).toHaveBeenCalledWith(4);
    expect(restoreMailReply).toHaveBeenCalledWith(9);
  });
});
