/**
 * Whether an account may receive cloud sort LLM credentials.
 *
 * Trial validity has exactly one source of truth: `trial_active` (derived from
 * `trial_ends_at`, see `getProfile()`). The `free_trial`-sourced entitlement row
 * is written once at signup and never revisited afterwards, so its `active`
 * flag goes stale the moment the trial ends — it must never be trusted here,
 * or an expired trial keeps granting cloud sort credentials forever. Paid
 * (`stripe`-sourced) entitlements are kept in sync by the Stripe webhook, so
 * those remain a valid fallback.
 *
 * @param {{ trial_active?: boolean; entitlements?: Array<{ feature?: string; source?: string; active?: boolean }> } | null | undefined} profile
 */
function accountHasSortAccess(profile) {
  if (!profile) return false;
  if (profile.trial_active) return true;
  const ents = profile.entitlements;
  if (!Array.isArray(ents)) return false;
  return ents.some((e) => e?.feature === "sort" && e?.active && e?.source !== "free_trial");
}

module.exports = { accountHasSortAccess };
