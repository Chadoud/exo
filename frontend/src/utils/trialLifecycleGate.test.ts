// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { EntitlementStatus } from "../api";
import {
  TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY,
  TRIAL_GATE_DISMISSED_SESSION_KEY,
} from "../constants";
import {
  clearTrialGateDismissed,
  computeTrialLifecycleModal,
  isTrialLimitedMode,
  markTrialGateDismissed,
  markTrialNudgeSeen,
  readTrialGateDismissed,
  readTrialNudgeSeen,
  shouldShowTrialLimitedBanner,
} from "./trialLifecycleGate";

function ent(overrides: Partial<EntitlementStatus>): EntitlementStatus {
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

describe("computeTrialLifecycleModal", () => {
  it("shows nothing when entitlement has not loaded yet", () => {
    expect(computeTrialLifecycleModal(null, false)).toBe("none");
  });

  it("shows nothing for licensed users even if trial fields say expired", () => {
    expect(computeTrialLifecycleModal(ent({ licensed: true, trialExpired: true }), false)).toBe(
      "none",
    );
  });

  it("shows nothing for unlimited-build users", () => {
    expect(
      computeTrialLifecycleModal(ent({ unlimitedBuild: true, trialExpired: true }), false),
    ).toBe("none");
  });

  it("shows nothing for subscribers even when the trial has expired", () => {
    expect(
      computeTrialLifecycleModal(
        ent({ subscriptionEntitled: true, trialExpired: true, trialActive: false }),
        false,
      ),
    ).toBe("none");
  });

  it("shows nothing right after checkout when only subscriptionActive is set", () => {
    expect(
      computeTrialLifecycleModal(
        ent({ subscriptionActive: true, subscriptionEntitled: false, trialExpired: true }),
        false,
      ),
    ).toBe("none");
  });

  it("still gates after the subscription is canceled and the trial is over", () => {
    expect(
      computeTrialLifecycleModal(
        ent({
          subscriptionActive: false,
          subscriptionEntitled: false,
          subscriptionStatus: "canceled",
          trialExpired: true,
          trialActive: false,
        }),
        true,
      ),
    ).toBe("gate");
  });

  it("shows the gate whenever the trial has expired", () => {
    expect(computeTrialLifecycleModal(ent({ trialExpired: true, trialActive: false }), true)).toBe(
      "gate",
    );
  });

  it("gate wins over the nudge if both conditions were somehow true", () => {
    expect(
      computeTrialLifecycleModal(
        ent({ trialExpired: true, trialActive: true, trialDaysRemaining: 1 }),
        false,
      ),
    ).toBe("gate");
  });

  it("shows the nudge when 3 or fewer days remain and it has not been seen", () => {
    expect(computeTrialLifecycleModal(ent({ trialDaysRemaining: 3 }), false)).toBe("nudge");
    expect(computeTrialLifecycleModal(ent({ trialDaysRemaining: 0 }), false)).toBe("nudge");
  });

  it("does not show the nudge once it has been seen", () => {
    expect(computeTrialLifecycleModal(ent({ trialDaysRemaining: 1 }), true)).toBe("none");
  });

  it("does not show the nudge while more than 3 days remain", () => {
    expect(computeTrialLifecycleModal(ent({ trialDaysRemaining: 4 }), false)).toBe("none");
  });

  it("suppresses the gate after the user opted into limited access", () => {
    expect(
      computeTrialLifecycleModal(ent({ trialExpired: true, trialActive: false }), true, true),
    ).toBe("none");
  });
});

describe("shouldShowTrialLimitedBanner", () => {
  it("hides until entitlement is loaded and the gate was dismissed", () => {
    const limited = ent({ trialExpired: true, trialActive: false, canAnalyze: false });
    expect(
      shouldShowTrialLimitedBanner(limited, { entitlementLoaded: false, gateDismissed: true }),
    ).toBe(false);
    expect(
      shouldShowTrialLimitedBanner(limited, { entitlementLoaded: true, gateDismissed: false }),
    ).toBe(false);
  });

  it("hides when paid features still work", () => {
    expect(
      shouldShowTrialLimitedBanner(ent({ trialExpired: true, trialActive: false, canAnalyze: true }), {
        entitlementLoaded: true,
        gateDismissed: true,
      }),
    ).toBe(false);
  });

  it("shows only when limited and analyze is off", () => {
    expect(
      shouldShowTrialLimitedBanner(ent({ trialExpired: true, trialActive: false, canAnalyze: false }), {
        entitlementLoaded: true,
        gateDismissed: true,
      }),
    ).toBe(true);
  });
});

describe("isTrialLimitedMode", () => {
  it("is true only when the trial expired with no entitlement", () => {
    expect(isTrialLimitedMode(ent({ trialExpired: true, trialActive: false }))).toBe(true);
    expect(isTrialLimitedMode(ent({ trialExpired: false }))).toBe(false);
    expect(isTrialLimitedMode(null)).toBe(false);
  });

  it("is false for licensed, unlimited, or subscribed users", () => {
    expect(isTrialLimitedMode(ent({ trialExpired: true, licensed: true }))).toBe(false);
    expect(isTrialLimitedMode(ent({ trialExpired: true, unlimitedBuild: true }))).toBe(false);
    expect(isTrialLimitedMode(ent({ trialExpired: true, subscriptionEntitled: true }))).toBe(false);
    expect(isTrialLimitedMode(ent({ trialExpired: true, subscriptionActive: true }))).toBe(false);
  });
});

describe("trial gate dismissal storage (session-scoped)", () => {
  beforeEach(() => {
    sessionStorage.removeItem(TRIAL_GATE_DISMISSED_SESSION_KEY);
  });

  it("defaults to not dismissed", () => {
    expect(readTrialGateDismissed()).toBe(false);
  });

  it("persists once marked and can be cleared for the See-plans path", () => {
    markTrialGateDismissed();
    expect(readTrialGateDismissed()).toBe(true);
    clearTrialGateDismissed();
    expect(readTrialGateDismissed()).toBe(false);
  });
});

describe("trial nudge seen storage", () => {
  beforeEach(() => {
    localStorage.removeItem(TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY);
  });

  it("defaults to unseen", () => {
    expect(readTrialNudgeSeen()).toBe(false);
  });

  it("persists once marked", () => {
    markTrialNudgeSeen();
    expect(readTrialNudgeSeen()).toBe(true);
  });
});
