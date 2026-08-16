/**
 * Whether to show the full-screen “Exo isn't ready” overlay.
 * Hides during active sorts, startup probing, and shortly after the last successful health probe.
 */
export function shouldShowOfflineConnectionStrip(args: {
  backendOnline: boolean;
  backendHealthProbing: boolean;
  backendServiceStarting?: boolean;
  /** Desktop app uses the startup overlay instead of this modal. */
  isDesktopManaged?: boolean;
  backendStartupFailed?: boolean;
  isRunning: boolean;
  hasCurrentJob: boolean;
  lastHealthOkAt: number | null;
  graceMs: number;
  now?: number;
}): boolean {
  const {
    backendOnline,
    backendHealthProbing,
    backendServiceStarting = false,
    isDesktopManaged = false,
    backendStartupFailed = false,
    isRunning,
    hasCurrentJob,
    lastHealthOkAt,
    graceMs,
    now = Date.now(),
  } = args;
  if (isDesktopManaged || backendStartupFailed) return false;
  if (backendOnline || backendHealthProbing || backendServiceStarting) return false;
  if (isRunning || hasCurrentJob) return false;
  if (lastHealthOkAt != null && now - lastHealthOkAt < graceMs) return false;
  return true;
}

/** Friendly loading overlay while the desktop app's local service is still booting. */
export function shouldShowAppServiceStartupOverlay(args: {
  isDesktopManaged: boolean;
  backendOnline: boolean;
  backendHealthProbing: boolean;
  backendServiceStarting: boolean;
  backendStartupFailed?: boolean;
  /** Unix ms of last successful /health this session. */
  lastHealthOkAt?: number | null;
}): boolean {
  const {
    isDesktopManaged,
    backendOnline,
    backendHealthProbing,
    backendServiceStarting,
    backendStartupFailed = false,
    lastHealthOkAt = null,
  } = args;
  if (!isDesktopManaged || backendOnline) return false;
  if (backendStartupFailed) return true;
  // Cold start + explicit Restart service (beginBackendStartupProbe).
  if (backendHealthProbing) return true;
  // Mid-session: service was up. A slow /health must not cover the window.
  if (lastHealthOkAt != null) return false;
  return backendServiceStarting;
}
