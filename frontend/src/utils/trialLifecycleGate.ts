import type { EntitlementStatus } from "../api";
import {
  TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY,
  TRIAL_ENDING_NUDGE_WARNING_DAYS,
  TRIAL_GATE_DISMISSED_SESSION_KEY,
} from "../constants";

type TrialLifecycleModal = "none" | "nudge" | "gate";

/** True once the user has decided (either button, Esc, or backdrop) on the trial-ending nudge. */
export function readTrialNudgeSeen(): boolean {
  try {
    return localStorage.getItem(TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTrialNudgeSeen(): void {
  try {
    localStorage.setItem(TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** True while the trial is over and no license/subscription entitles paid features (freemium limited mode). */
export function isTrialLimitedMode(entitlement: EntitlementStatus | null): boolean {
  if (!entitlement || entitlement.licensed || entitlement.unlimitedBuild) return false;
  if (entitlement.subscriptionEntitled || entitlement.subscriptionActive) return false;
  return entitlement.trialExpired;
}

/** True if the user already chose "Continue with limited access" this session (gate returns next launch). */
export function readTrialGateDismissed(): boolean {
  try {
    return sessionStorage.getItem(TRIAL_GATE_DISMISSED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTrialGateDismissed(): void {
  try {
    sessionStorage.setItem(TRIAL_GATE_DISMISSED_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearTrialGateDismissed(): void {
  try {
    sessionStorage.removeItem(TRIAL_GATE_DISMISSED_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Which trial lifecycle modal (if any) should be shown right now.
 * The trial-ended gate always wins over the one-time nudge — an expired trial is a
 * stronger signal than "ending soon", and the two conditions cannot legitimately overlap.
 */
export function computeTrialLifecycleModal(
  entitlement: EntitlementStatus | null,
  nudgeSeen: boolean,
  gateDismissed = false
): TrialLifecycleModal {
  if (!entitlement || entitlement.licensed || entitlement.unlimitedBuild) return "none";
  // Subscribers never see trial modals — subscriptionActive also covers the
  // deep-link window right after checkout, before the next full cache sync.
  if (entitlement.subscriptionEntitled || entitlement.subscriptionActive) return "none";
  // Freemium: once the user opts into limited access, the banner takes over for this session.
  if (entitlement.trialExpired) return gateDismissed ? "none" : "gate";
  if (
    entitlement.trialActive &&
    !nudgeSeen &&
    entitlement.trialDaysRemaining <= TRIAL_ENDING_NUDGE_WARNING_DAYS
  ) {
    return "nudge";
  }
  return "none";
}
