import { describe, expect, it } from "vitest";
import { errorActionId, userFacingErrorDetail } from "./userGuidance";

describe("userFacingErrorDetail local API drop", () => {
  it("maps Electron proxy 'fetch failed' to a retryable backend hint", () => {
    const err = new Error("fetch failed");
    const detail = userFacingErrorDetail(err);
    expect(detail.actionId).toBe("backend:retry");
    expect(detail.hint).toMatch(/local|Retry|Restart/i);
  });
});

describe("userFacingErrorDetail voice credential sync", () => {
  it("maps Gemini voice sync failures to AI provider settings", () => {
    const err = new Error(
      "Could not sync your Gemini key to the voice backend. Check Settings → AI agents → AI provider.",
    );
    const detail = userFacingErrorDetail(err);
    expect(detail.actionId).toBe("settings:ai-provider");
    expect(detail.hint).toMatch(/AI agents/i);
    expect(errorActionId(err)).toBe("settings:ai-provider");
  });
});
