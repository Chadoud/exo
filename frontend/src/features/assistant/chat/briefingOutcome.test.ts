import { describe, expect, it } from "vitest";
import {
  appendBriefingSectionRecord,
  appendBriefingTasksHonesty,
  sanitizeBriefingAssistantText,
} from "./briefingOutcome";
import type { ConversationMessage } from "../../../hooks/useConversations";

describe("briefingOutcome", () => {
  it("strips briefing injection payloads so they never persist", () => {
    expect(
      sanitizeBriefingAssistantText(
        "[BRIEFING: MAIL — From: a@b.com — Subject: secret — Preview: hi]\n[/BRIEFING: MAIL]",
      ),
    ).toBe("");
    expect(sanitizeBriefingAssistantText("Two things need you today.")).toBe(
      "Two things need you today.",
    );
  });

  it("records one muted card per section and refuses a second write", () => {
    const first = appendBriefingSectionRecord([], {
      section: "mail",
      outcome: "skipped_fail",
      briefingRunId: "run-1",
      makeMessageId: () => "m1",
      nowIso: "2026-08-16T12:00:00.000Z",
    });
    const second = appendBriefingSectionRecord(first, {
      section: "mail",
      outcome: "nothing",
      briefingRunId: "run-1",
      makeMessageId: () => "m2",
    });
    expect(second).toHaveLength(1);
    expect(second[0].content).toBe("");
    expect(second[0].content.startsWith("[BRIEFING:")).toBe(false);
    expect(second[0].briefingOutcome).toBe("skipped_fail");
  });

  it("appends tasks honesty once without a briefing header", () => {
    const prev: ConversationMessage[] = [];
    const next = appendBriefingTasksHonesty(prev, { makeMessageId: () => "t1" });
    const again = appendBriefingTasksHonesty(next, { makeMessageId: () => "t2" });
    expect(again).toHaveLength(1);
    expect(again[0].briefingSection).toBeUndefined();
    expect(again[0].briefingTasksHonesty).toBe(true);
    expect(again[0].content).toBe("");
  });
});
