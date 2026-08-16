/**
 * Decide whether a live /health means the local API is usable, and whether
 * SIGKILL on the listen port is allowed.
 *
 * Killing a healthy listener drops in-flight Sort / Gmail import and surfaces
 * as renderer "fetch failed".
 */

/**
 * After waitForBackend, decide whether to free the port and retry spawn.
 *
 * @param {{ healthUp: boolean, waitSucceeded: boolean }} input
 * @returns {{ ok: boolean, freePort: boolean }}
 */
function decideRestartRecovery(input) {
  const healthUp = input && input.healthUp === true;
  const waitSucceeded = input && input.waitSucceeded === true;
  if (waitSucceeded || healthUp) {
    return { ok: true, freePort: false };
  }
  return { ok: false, freePort: true };
}

/**
 * Keep a live API. Credential refresh / Retry must not SIGTERM a healthy
 * process — that drops Gmail import and folder-tree fetches.
 *
 * @param {{ healthUp: boolean, hasManagedChild?: boolean }} input
 * @returns {{ skipRestart: boolean, reason?: string }}
 */
function decideRestartSkip(input) {
  const healthUp = input && input.healthUp === true;
  if (healthUp) {
    const hasManagedChild = input && input.hasManagedChild === true;
    return {
      skipRestart: true,
      reason: hasManagedChild ? "already_up" : "adopted_listener",
    };
  }
  return { skipRestart: false };
}

/**
 * SIGKILL on the listen port is allowed only when /health is down, or the
 * caller is doing a boot-time force clear.
 *
 * @param {{ healthUp: boolean, force?: boolean }} input
 * @returns {boolean}
 */
function shouldFreeBackendPort(input) {
  if (input && input.force === true) return true;
  return input ? input.healthUp !== true : true;
}

/**
 * Periodic getManagedBackendStatus must never SIGKILL. A single failed
 * /health while something still listens is a blip, not a stale bind.
 *
 * @param {{ healthUp: boolean, listenerCount: number }} input
 * @returns {{ ok: boolean, reason?: string, spawn: boolean }}
 */
function decideStatusPollRecovery(input) {
  const healthUp = input && input.healthUp === true;
  const listenerCount = input && Number(input.listenerCount) > 0 ? Number(input.listenerCount) : 0;
  if (healthUp) {
    return { ok: true, spawn: false };
  }
  if (listenerCount > 0) {
    return { ok: false, reason: "starting", spawn: false };
  }
  return { ok: false, reason: "health_timeout", spawn: true };
}

module.exports = {
  decideRestartRecovery,
  decideRestartSkip,
  decideStatusPollRecovery,
  shouldFreeBackendPort,
};
