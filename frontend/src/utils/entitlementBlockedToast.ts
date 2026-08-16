import type { EntitlementStatus } from "../api";

/** Stable sonner id so license save can dismiss a leftover trial-ended toast. */
export const ENTITLEMENT_BLOCKED_TOAST_ID = "entitlement-blocked";

type EntitlementBlockedToastKind = "none" | "trial_ended";

/**
 * Settings already shows LICENSED when a key is saved. The processing toast must
 * not keep saying the trial ended — that contradiction is a product bug, not a
 * "reload the app" moment.
 */
export function entitlementBlockedToastKind(
  entitlement: EntitlementStatus | null,
): EntitlementBlockedToastKind {
  if (!entitlement) return "trial_ended";
  if (entitlement.licensed || entitlement.unlimitedBuild) return "none";
  if (entitlement.subscriptionEntitled || entitlement.subscriptionActive) return "none";
  if (entitlement.canAnalyze) return "none";
  return "trial_ended";
}
