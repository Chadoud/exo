import { describe, expect, it } from "vitest";
import {
  AGENT_FAILURE_RETRY_PREFIX,
  buildAgentFailureRetryPrompt,
  extractAgentRetryGoal,
  isTrashAgentFailure,
  oneLineFailureWhy,
  parseAgentFailureContent,
} from "./agentFailureContent";

describe("parseAgentFailureContent", () => {
  it("splits goal and outcome", () => {
    const parsed = parseAgentFailureContent(
      'Goal: Delete WORK events\nOutcome: No calendar tool was available.',
    );
    expect(parsed.goal).toBe("Delete WORK events");
    expect(parsed.outcome).toBe("No calendar tool was available.");
  });

  it("returns raw text when format is unknown", () => {
    const parsed = parseAgentFailureContent("Something unexpected happened.");
    expect(parsed.goal).toBe("Something unexpected happened.");
    expect(parsed.outcome).toBe("");
  });
});

describe("buildAgentFailureRetryPrompt", () => {
  it("prefills only the original goal with the retry prefix", () => {
    const prompt = buildAgentFailureRetryPrompt({
      goal: "find my latest invoices",
      outcome: 'tool "list_invoices" isn\'t available',
      raw: "",
    });
    expect(prompt).toBe(`${AGENT_FAILURE_RETRY_PREFIX} find my latest invoices`);
    expect(prompt).not.toContain("list_invoices");
  });

  it("falls back to raw when goal is empty", () => {
    const prompt = buildAgentFailureRetryPrompt({
      goal: "",
      outcome: "",
      raw: "Something unexpected happened.",
    });
    expect(prompt).toBe(`${AGENT_FAILURE_RETRY_PREFIX} Something unexpected happened.`);
  });
});

describe("extractAgentRetryGoal", () => {
  it("strips the retry prefix (legacy autonomously form too)", () => {
    expect(
      extractAgentRetryGoal(`${AGENT_FAILURE_RETRY_PREFIX} find my latest invoices`),
    ).toBe("find my latest invoices");
    expect(
      extractAgentRetryGoal("Please retry this autonomously: find my latest invoices"),
    ).toBe("find my latest invoices");
  });

  it("returns plain text unchanged", () => {
    expect(extractAgentRetryGoal("deploy on Vercel")).toBe("deploy on Vercel");
  });
});

describe("isTrashAgentFailure", () => {
  it("drops cut-off unparseable asks", () => {
    expect(
      isTrashAgentFailure({
        goal: ". Yeah, that's",
        outcome: "I can't determine what you're asking—your message is cut off.",
        raw: "",
      }),
    ).toBe(true);
  });

  it("keeps a clear failed ask", () => {
    expect(
      isTrashAgentFailure({
        goal: "find my latest invoices and summarize them",
        outcome: "Couldn't pull the amount for one invoice.",
        raw: "",
      }),
    ).toBe(false);
  });
});

describe("oneLineFailureWhy", () => {
  it("keeps the first line and drops the rest", () => {
    expect(oneLineFailureWhy("Couldn't reach the calendar.\nMissing scope.")).toBe(
      "Couldn't reach the calendar.",
    );
  });

  it("returns empty when there is no outcome", () => {
    expect(oneLineFailureWhy("")).toBe("");
    expect(oneLineFailureWhy("   \n  ")).toBe("");
  });
});
