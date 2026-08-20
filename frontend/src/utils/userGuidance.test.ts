import { describe, expect, it } from "vitest";
import { backendOfflineHint, errorActionId, sanitizeBackendErrorForUser, userFacingErrorDetail } from "./userGuidance";

describe("sanitizeBackendErrorForUser", () => {
  it("hides loopback, ports, and SKIP_BACKEND from packaged users", () => {
    const raw =
      "Cannot reach the API at http://127.0.0.1:7799 (is the backend running on port 7799?)";
    const detail = sanitizeBackendErrorForUser(raw, false);
    expect(detail).not.toMatch(/127\.0\.0\.1|7799|SKIP_BACKEND|uvicorn/i);
    expect(detail).toMatch(/local assistant service/i);
    const hint = backendOfflineHint(false);
    expect(hint).not.toMatch(/SKIP_BACKEND|uvicorn|127\.0\.0\.1|7799/i);
  });

  it("keeps developer detail when verbose", () => {
    const raw = "Cannot reach the API at http://127.0.0.1:7799";
    expect(sanitizeBackendErrorForUser(raw, true)).toContain("127.0.0.1");
    expect(backendOfflineHint(true)).toMatch(/SKIP_BACKEND/);
  });
});

describe("userFacingErrorDetail local API drop", () => {
  it("maps packaged local-service copy to a retryable backend hint", () => {
    const err = new Error("Exo could not reach the local assistant service yet.");
    const detail = userFacingErrorDetail(err);
    expect(detail.actionId).toBe("backend:retry");
    expect(detail.hint).toBeTruthy();
  });

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
