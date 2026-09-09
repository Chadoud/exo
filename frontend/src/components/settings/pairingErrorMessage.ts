export function pairingErrorMessage(
  result: unknown,
  fallback: string,
  keyUnreadable?: string,
  sessionExpired?: string,
): string {
  if (result && typeof result === "object" && "error" in result) {
    const err = (result as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) {
      if (
        keyUnreadable &&
        (err.includes("sync_master_key_unreadable") || err.includes("sync_not_enabled"))
      ) {
        return keyUnreadable;
      }
      if (
        sessionExpired &&
        (err.includes("invalid_token") ||
          err.includes("missing_token") ||
          err.includes("not_logged_in") ||
          err.includes("401"))
      ) {
        return sessionExpired;
      }
      return `${fallback} (${err.trim()})`;
    }
  }
  return fallback;
}
