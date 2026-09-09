import type { VoiceBackendReadyResult, VoiceBackendReadyReason } from "./ensureVoiceBackendReady";

export type VoiceReadinessState = "checking" | "missing_key" | "ready" | "unavailable";

export type VoiceUnavailableReason = Exclude<VoiceBackendReadyReason, "missing_key">;

export type VoiceReadinessSnapshot =
  | { state: "checking" }
  | { state: "missing_key" }
  | { state: "ready"; model: string }
  | { state: "unavailable"; reason: VoiceUnavailableReason };

export type VoiceReadinessBannerKind = "none" | "checking" | "missing_key" | "unavailable";

export type VoiceReadinessAction = "none" | "settings" | "refresh";

export type VoiceReadinessView = {
  canStart: boolean;
  busy: boolean;
  bannerKind: VoiceReadinessBannerKind;
  messageKey: string | null;
  action: VoiceReadinessAction;
};

/** Immediate snapshot before / while a status check runs. */
export function snapshotWhilePending(settingsHydrated: boolean, backendOnline: boolean): VoiceReadinessSnapshot {
  if (!settingsHydrated) return { state: "checking" };
  if (!backendOnline) return { state: "unavailable", reason: "offline" };
  return { state: "checking" };
}

export function snapshotFromEnsureResult(result: VoiceBackendReadyResult): VoiceReadinessSnapshot {
  if (result.ready) return { state: "ready", model: result.model };
  switch (result.reason) {
    case "missing_key":
      return { state: "missing_key" };
    case "offline":
    case "sync_failed":
    case "backend_not_ready":
      return { state: "unavailable", reason: result.reason };
    default: {
      const _exhaustive: never = result.reason;
      return _exhaustive;
    }
  }
}

export function messageKeyForUnavailable(reason: VoiceUnavailableReason): string {
  switch (reason) {
    case "offline":
      return "voice.readinessUnavailableOffline";
    case "sync_failed":
      return "voice.readinessUnavailableSync";
    case "backend_not_ready":
      return "voice.readinessUnavailableBackend";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/** Pre-session control flags only — runtime `voice.error` stays on the issue banner. */
export function deriveVoiceReadinessView(snapshot: VoiceReadinessSnapshot): VoiceReadinessView {
  switch (snapshot.state) {
    case "checking":
      return {
        canStart: false,
        busy: true,
        bannerKind: "checking",
        messageKey: "voice.readinessChecking",
        action: "none",
      };
    case "missing_key":
      return {
        canStart: false,
        busy: false,
        bannerKind: "missing_key",
        messageKey: "voice.readinessMissingKey",
        action: "settings",
      };
    case "ready":
      return {
        canStart: true,
        busy: false,
        bannerKind: "none",
        messageKey: null,
        action: "none",
      };
    case "unavailable":
      return {
        canStart: false,
        busy: false,
        bannerKind: "unavailable",
        messageKey: messageKeyForUnavailable(snapshot.reason),
        action: "refresh",
      };
    default: {
      const _exhaustive: never = snapshot;
      return _exhaustive;
    }
  }
}

export function showGearWarningBadge(
  snapshot: VoiceReadinessSnapshot,
  options: { micEntryVisible: boolean },
): boolean {
  if (snapshot.state !== "missing_key" && snapshot.state !== "unavailable") return false;
  return !options.micEntryVisible;
}
