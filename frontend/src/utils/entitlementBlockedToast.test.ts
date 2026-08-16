import { describe, expect, it } from "vitest";
import type { EntitlementStatus } from "../api";
import { entitlementBlockedToastKind } from "./entitlementBlockedToast";

function ent(overrides: Partial<EntitlementStatus>): EntitlementStatus {
  return {
    trialActive: false,
    trialStartedAt: null,
    trialEndsAt: null,
    trialDaysRemaining: 0,
    trialExpired: true,
    licensed: false,
    licenseReason: null,
    canAnalyze: false,
    hasLicenseKey: false,
    ...overrides,
  };
}

describe("entitlementBlockedToastKind", () => {
  it("hides the trial-ended toast once a license is saved", () => {
    expect(entitlementBlockedToastKind(ent({ licensed: true, canAnalyze: true }))).toBe("none");
  });

  it("hides the toast for unlimited builds and subscribers", () => {
    expect(entitlementBlockedToastKind(ent({ unlimitedBuild: true }))).toBe("none");
    expect(entitlementBlockedToastKind(ent({ subscriptionEntitled: true }))).toBe("none");
    expect(entitlementBlockedToastKind(ent({ subscriptionActive: true }))).toBe("none");
  });

  it("hides the toast when processing is already allowed", () => {
    expect(entitlementBlockedToastKind(ent({ canAnalyze: true, trialExpired: true }))).toBe("none");
  });

  it("shows trial-ended only when the account is actually limited", () => {
    expect(entitlementBlockedToastKind(null)).toBe("trial_ended");
    expect(entitlementBlockedToastKind(ent({}))).toBe("trial_ended");
  });
});
