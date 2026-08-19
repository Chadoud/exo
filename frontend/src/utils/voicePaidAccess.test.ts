import { describe, expect, it } from "vitest";
import type { EntitlementStatus } from "../api";
import { voicePaidAllowed } from "./voicePaidAccess";

function ent(overrides: Partial<EntitlementStatus> = {}): EntitlementStatus {
  return {
    trialActive: true,
    trialStartedAt: null,
    trialEndsAt: null,
    trialDaysRemaining: 7,
    trialExpired: false,
    licensed: false,
    licenseReason: null,
    canAnalyze: true,
    hasLicenseKey: false,
    ...overrides,
  };
}

describe("voicePaidAllowed", () => {
  it("is false until entitlement has loaded", () => {
    expect(voicePaidAllowed(ent(), false)).toBe(false);
    expect(voicePaidAllowed(null, true)).toBe(false);
  });

  it("follows canAnalyze after load", () => {
    expect(voicePaidAllowed(ent({ canAnalyze: true }), true)).toBe(true);
    expect(voicePaidAllowed(ent({ canAnalyze: false }), true)).toBe(false);
  });
});
