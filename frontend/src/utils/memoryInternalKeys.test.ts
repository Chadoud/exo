import { describe, expect, it } from "vitest";
import { HIDDEN_INTERNAL_MEMORY_KEYS } from "./memoryInternalKeys";

describe("HIDDEN_INTERNAL_MEMORY_KEYS", () => {
  it("hides only the briefing v2 vault flag", () => {
    expect([...HIDDEN_INTERNAL_MEMORY_KEYS]).toEqual(["startup_briefing_consent_v2"]);
  });
});
