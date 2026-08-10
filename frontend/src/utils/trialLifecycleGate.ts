import type { EntitlementStatus } from "../api";
import {
  TRIAL_ENDING_NUDGE_SEEN_STORAGE_KEY,
  TRIAL_ENDING_NUDGE_WARNING_DAYS,
} from "../constants";

export type TrialLifecycleModal = "none" | "nudge" | "gate";

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

/**
 * Which trial lifecycle modal (if any) should be shown right now.
 * The trial-ended gate always wins over the one-time nudge — an expired trial is a
 * stronger signal than "ending soon", and the two conditions cannot legitimately overlap.
 */
export function computeTrialLifecycleModal(
  entitlement: EntitlementStatus | null,
  nudgeSeen: boolean
): TrialLifecycleModal {
  if (!entitlement || entitlement.licensed || entitlement.unlimitedBuild) return "none";
  // Subscribers never see trial modals — subscriptionActive also covers the
  // deep-link window right after checkout, before the next full cache sync.
  if (entitlement.subscriptionEntitled || entitlement.subscriptionActive) return "none";
  if (entitlement.trialExpired) return "gate";
  if (
    entitlement.trialActive &&
    !nudgeSeen &&
    entitlement.trialDaysRemaining <= TRIAL_ENDING_NUDGE_WARNING_DAYS
  ) {
    return "nudge";
  }
  return "none";
}
