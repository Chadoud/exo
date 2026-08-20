import { describe, expect, it } from "vitest";
import { formatMemoryForPrompt } from "./memory";

describe("formatMemoryForPrompt", () => {
  it("omits the briefing v2 migration flag", () => {
    const block = formatMemoryForPrompt({
      identity: {},
      preferences: {
        startup_briefing_consent: "granted",
        startup_briefing_consent_v2: "1",
      },
      projects: {},
      context: {},
      notes: {},
      relationships: {},
      wishes: {},
    });
    expect(block).toContain("startup_briefing_consent: granted");
    expect(block).not.toContain("startup_briefing_consent_v2");
  });
});
