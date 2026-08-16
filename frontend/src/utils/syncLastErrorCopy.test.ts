import { describe, expect, it } from "vitest";
import { isStaleTrialSyncError, syncLastErrorKind } from "./syncLastErrorCopy";

describe("syncLastErrorKind", () => {
  it("marks a leftover trial_expired for retry once the device is licensed", () => {
    expect(syncLastErrorKind("trial_expired", true)).toBe("stale_trial_retry");
    expect(isStaleTrialSyncError("trial_expired", true)).toBe(true);
  });

  it("maps trial_expired to plain copy when the trial really ended", () => {
    expect(syncLastErrorKind("trial_expired", false)).toBe("trial_ended");
    expect(syncLastErrorKind("sync_run_402 trial_expired", false)).toBe("trial_ended");
  });

  it("maps cloud 401 pull failures to sign-in-again", () => {
    expect(syncLastErrorKind("session_expired", true)).toBe("session_expired");
    expect(syncLastErrorKind("Client error '401 Unauthorized'", false)).toBe("session_expired");
  });

  it("passes through other errors", () => {
    expect(syncLastErrorKind("sync_master_key_unreadable", true)).toBe("raw");
    expect(syncLastErrorKind(null, false)).toBe("hidden");
  });
});
