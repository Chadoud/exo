import type { EntitlementStatus } from "../api";

/** Voice / briefing / send require the same paid bit as sort. */
export function voicePaidAllowed(
  entitlement: EntitlementStatus | null,
  entitlementLoaded: boolean,
): boolean {
  if (!entitlementLoaded || !entitlement) return false;
  return entitlement.canAnalyze !== false;
}
