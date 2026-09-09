import { describe, expect, it } from "vitest";
import {
  deriveVoiceReadinessView,
  messageKeyForUnavailable,
  showGearWarningBadge,
  snapshotFromEnsureResult,
  snapshotWhilePending,
} from "./voiceReadiness";

describe("snapshotWhilePending", () => {
  it("stays checking until settings hydrate", () => {
    expect(snapshotWhilePending(false, false)).toEqual({ state: "checking" });
    expect(snapshotWhilePending(false, true)).toEqual({ state: "checking" });
  });

  it("is unavailable offline after hydrate", () => {
    expect(snapshotWhilePending(true, false)).toEqual({ state: "unavailable", reason: "offline" });
  });

  it("is checking when hydrated and online", () => {
    expect(snapshotWhilePending(true, true)).toEqual({ state: "checking" });
  });
});

describe("snapshotFromEnsureResult", () => {
  it("maps ready with model", () => {
    expect(snapshotFromEnsureResult({ ready: true, model: "gemini-live" })).toEqual({
      state: "ready",
      model: "gemini-live",
    });
  });

  it("maps missing_key without treating vault-only as missing", () => {
    expect(snapshotFromEnsureResult({ ready: false, reason: "missing_key" })).toEqual({
      state: "missing_key",
    });
  });

  it.each(["offline", "sync_failed", "backend_not_ready"] as const)(
    "keeps %s as unavailable, not missing_key",
    (reason) => {
      expect(snapshotFromEnsureResult({ ready: false, reason })).toEqual({
        state: "unavailable",
        reason,
      });
    },
  );
});

describe("deriveVoiceReadinessView", () => {
  it("disables start while checking", () => {
    expect(deriveVoiceReadinessView({ state: "checking" })).toEqual({
      canStart: false,
      busy: true,
      bannerKind: "checking",
      messageKey: "voice.readinessChecking",
      action: "none",
    });
  });

  it("sends missing key to settings", () => {
    expect(deriveVoiceReadinessView({ state: "missing_key" })).toMatchObject({
      canStart: false,
      bannerKind: "missing_key",
      action: "settings",
    });
  });

  it("enables start when ready", () => {
    expect(deriveVoiceReadinessView({ state: "ready", model: "x" })).toMatchObject({
      canStart: true,
      bannerKind: "none",
      action: "none",
    });
  });

  it("refreshes unavailable reasons with distinct copy keys", () => {
    expect(messageKeyForUnavailable("offline")).toBe("voice.readinessUnavailableOffline");
    expect(deriveVoiceReadinessView({ state: "unavailable", reason: "sync_failed" })).toMatchObject({
      canStart: false,
      action: "refresh",
      messageKey: "voice.readinessUnavailableSync",
    });
  });
});

describe("showGearWarningBadge", () => {
  it("hides the gear badge when the mic already carries the warning", () => {
    expect(showGearWarningBadge({ state: "missing_key" }, { micEntryVisible: true })).toBe(false);
  });

  it("shows the gear badge in PTT when the mic is hidden", () => {
    expect(showGearWarningBadge({ state: "unavailable", reason: "offline" }, { micEntryVisible: false })).toBe(
      true,
    );
  });
});
