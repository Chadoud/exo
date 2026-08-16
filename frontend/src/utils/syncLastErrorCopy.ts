type SyncLastErrorKind = "hidden" | "trial_ended" | "stale_trial_retry" | "session_expired" | "raw";

/** Raw worker codes must not leak next to a LICENSED badge. */
export function syncLastErrorKind(
  lastError: string | null | undefined,
  licensed: boolean,
): SyncLastErrorKind {
  const raw = typeof lastError === "string" ? lastError.trim() : "";
  if (!raw) return "hidden";
  if (raw === "trial_expired" || raw.includes("trial_expired")) {
    return licensed ? "stale_trial_retry" : "trial_ended";
  }
  if (
    raw === "session_expired" ||
    raw.includes("invalid_token") ||
    raw.includes("401") ||
    raw.includes("Unauthorized")
  ) {
    return "session_expired";
  }
  return "raw";
}

export function isStaleTrialSyncError(lastError: string | null | undefined, licensed: boolean): boolean {
  return syncLastErrorKind(lastError, licensed) === "stale_trial_retry";
}
