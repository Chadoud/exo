/**
 * Backend process lifecycle: health probing, kill/restart, and managed-status
 * polling. Depends one-directionally on backendProcess.js (spawn + env
 * assembly) for `startBackend`, `findPortListeners`, `exositesUserDataEnv` —
 * backendProcess.js must never require this file back, or Node's circular
 * require would hand out a partially-populated module.exports.
 */

const http = require("http");
const { execFileSync } = require("child_process");
const state = require("./state");
const {
  IS_DEV,
  IS_WIN,
  BACKEND_PORT,
  BACKEND_HEALTH_RETRIES,
  BACKEND_PACKAGED_HEALTH_RETRIES,
  BACKEND_PACKAGED_HEALTH_DELAY_MS,
  BACKEND_MAX_CRASHES_BEFORE_GIVE_UP,
  POLL_INTERVAL_MS,
} = require("./constants");
const {
  decideRestartRecovery,
  decideRestartSkip,
  decideStatusPollRecovery,
  shouldFreeBackendPort,
} = require("./backendPortRecovery");
const { deleteMaterializedGmailOAuthMirror } = require("./gmailOAuthMirrorStore");
const { delay } = require("./utils");
// backendProcess.js never requires this file back — one-directional only, so a
// plain top-level require here is safe regardless of which module loads first.
const { startBackend, findPortListeners, exositesUserDataEnv } = require("./backendProcess");

/**
 * Force-kill a process and its entire child tree.
 *
 * The backend is a bundled PyInstaller exe (which spawns a child) or a `python`
 * process that may fork workers. A plain `proc.kill()` only signals the direct
 * child, orphaning grandchildren that keep port 7799 bound. On Windows we use
 * `taskkill /T /F`; on POSIX we escalate SIGTERM → SIGKILL.
 *
 * @param {import("child_process").ChildProcess | null} proc
 */
function forceKillTree(proc) {
  if (!proc || typeof proc.pid !== "number") return;
  const { pid } = proc;
  if (IS_WIN) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch (err) {
      console.warn("[backend] taskkill failed, falling back to signal:", err && err.message);
    }
  }
  try {
    proc.kill("SIGTERM");
  } catch (_) {
    /* already gone */
  }
  const killEscalationMs = IS_DEV ? 400 : 2000;
  setTimeout(() => {
    try {
      if (!proc.killed) proc.kill("SIGKILL");
    } catch (_) {
      /* already gone */
    }
  }, killEscalationMs);
}

/** Wait until the backend child has exited (frees the listen port). Used before respawn. */
async function killBackendAndWait(timeoutMs = 8000) {
  const proc = state.backendProcess;
  if (!proc) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (state.backendProcess === proc) state.backendProcess = null;
      resolve();
    };
    proc.once("exit", finish);
    try {
      forceKillTree(proc);
    } catch {
      finish();
    }
    // Do not SIGKILL whoever holds 7799 — that drops in-flight Gmail import.
    // If this child is stuck, waitForBackend / Retry handle a truly down API.
    setTimeout(() => {
      if (!settled) {
        finish();
      }
    }, timeoutMs);
  });
}

function killBackend() {
  if (state.backendProcess) {
    forceKillTree(state.backendProcess);
    state.backendProcess = null;
  }
  try {
    deleteMaterializedGmailOAuthMirror(exositesUserDataEnv());
  } catch {
    /* ignore */
  }
}

/**
 * When Electron spawns the backend, /health must belong to our child — not a stale process
 * still bound to BACKEND_PORT after a failed bind (e.g. WinError 10048).
 */
function healthBelongsToManagedBackend() {
  if (IS_DEV && process.env.SKIP_BACKEND === "1") return true;
  const p = state.backendProcess;
  return p != null && p.exitCode === null;
}

/** @param {number} [timeoutMs] */
function probeBackendHealth(timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Recover the listen port only when /health is down (or boot `force`).
 * Implemented per-platform: `netstat`/`taskkill` on Windows, `lsof`/`kill` on macOS/Linux.
 *
 * @param {{ force?: boolean }} [opts] `force` is boot-only (replace a leftover
 * listener from a previous app). Never force while Sort / Gmail import can be
 * in flight.
 */
async function freeBackendPort(opts = {}) {
  const force = opts.force === true;
  // force=true always short-circuits shouldFreeBackendPort below — skip the probe entirely.
  const healthUp = force ? undefined : await probeBackendHealth(800);
  if (!shouldFreeBackendPort({ healthUp, force })) {
    console.warn("[backend] refusing to free port", BACKEND_PORT, "— /health is up");
    return;
  }
  const pids = findPortListeners();
  for (const pid of pids) {
    if (pid === String(process.pid)) continue;
    try {
      if (IS_WIN) {
        execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
      } else {
        execFileSync("kill", ["-9", pid], { stdio: "ignore" });
      }
      console.warn(`[backend] freed port ${BACKEND_PORT} by killing stale PID ${pid}`);
    } catch (_) {
      /* process may have already exited */
    }
  }
}

async function waitForBackend(retries = BACKEND_HEALTH_RETRIES, delayMs = POLL_INTERVAL_MS) {
  let warnedAdoptedHealth = false;
  for (let i = 0; i < retries; i++) {
    const healthUp = await probeBackendHealth();
    if (healthUp === true) {
      if (!healthBelongsToManagedBackend() && !warnedAdoptedHealth) {
        warnedAdoptedHealth = true;
        console.log(
          "[backend] /health is up — adopting the listener on port",
          BACKEND_PORT,
          "(not requiring a child handle)",
        );
      }
      return true;
    }
    await delay(delayMs);
  }
  return false;
}

function ensureBackendRunning() {
  if (IS_DEV && process.env.SKIP_BACKEND === "1") return;
  if (state.backendStartupGiveUp) return;
  if (!state.backendProcess || state.backendProcess.exitCode !== null) {
    startBackend();
  }
}

/** Coalesce concurrent restart requests into one kill/spawn/wait cycle. */
let restartBackendInFlight = null;

/** Kill running backend (if any) and start a new process; wait until /health responds. */
async function restartBackend() {
  if (IS_DEV && process.env.SKIP_BACKEND === "1") {
    console.warn("[backend] SKIP_BACKEND=1 — manage uvicorn yourself (e.g. python -m uvicorn main:app --port 7799)");
    return { ok: false, reason: "skip_backend" };
  }
  if (restartBackendInFlight) return restartBackendInFlight;

  restartBackendInFlight = (async () => {
    const coldStartMaxMs = BACKEND_PACKAGED_HEALTH_RETRIES * BACKEND_PACKAGED_HEALTH_DELAY_MS;
    const child = state.backendProcess;
    if (
      !IS_DEV &&
      child &&
      !child.killed &&
      child.exitCode === null &&
      state.backendSpawnedAt > 0
    ) {
      const elapsed = Date.now() - state.backendSpawnedAt;
      if (elapsed < coldStartMaxMs) {
        const remainingRetries = Math.max(
          1,
          Math.ceil((coldStartMaxMs - elapsed) / BACKEND_PACKAGED_HEALTH_DELAY_MS),
        );
        console.log(
          "[backend] Restart skipped — service still in cold start; waiting up to",
          Math.round((remainingRetries * BACKEND_PACKAGED_HEALTH_DELAY_MS) / 1000),
          "s",
        );
        const up = await waitForBackend(remainingRetries, BACKEND_PACKAGED_HEALTH_DELAY_MS);
        return { ok: up, reason: up ? undefined : "starting" };
      }
    }

    const alreadyUp = await probeBackendHealth(2500);
    const skip = decideRestartSkip({
      healthUp: alreadyUp,
      hasManagedChild: healthBelongsToManagedBackend(),
    });
    if (skip.skipRestart) {
      console.log("[backend] Restart skipped — adopting healthy listener on", BACKEND_PORT);
      return { ok: true, reason: skip.reason };
    }

    state.backendStartupGiveUp = false;
    state.backendCrashCount = 0;
    state.backendLastCrashAt = 0;
    await killBackendAndWait();
    await delay(150);
    startBackend();
    const restartWaitRetries = IS_DEV ? 45 : BACKEND_PACKAGED_HEALTH_RETRIES;
    const restartWaitDelayMs = IS_DEV ? 350 : BACKEND_PACKAGED_HEALTH_DELAY_MS;
    let up = await waitForBackend(restartWaitRetries, restartWaitDelayMs);
    const recovery = decideRestartRecovery({
      healthUp: up || (await probeBackendHealth()),
      waitSucceeded: up,
    });
    if (recovery.freePort) {
      // /health is actually down — a stale bind may be blocking spawn.
      console.warn("[backend] /health not ready — freeing port and retrying once");
      await killBackendAndWait();
      await freeBackendPort();
      await delay(250);
      startBackend();
      up = await waitForBackend(restartWaitRetries, restartWaitDelayMs);
    } else if (!up && recovery.ok) {
      console.log("[backend] /health up on adopted listener — not freeing port");
      up = true;
    }
    if (!up) {
      console.error("[backend] /health did not become ready after restart");
    }
    return { ok: up, reason: up ? undefined : "health_timeout" };
  })();

  try {
    return await restartBackendInFlight;
  } finally {
    restartBackendInFlight = null;
  }
}

/**
 * Cold-start progress from the same spawn timestamp and wait window as managed health checks.
 *
 * @param {boolean} [healthReady]
 * @returns {{ elapsedMs: number; maxWaitMs: number; percent: number }}
 */
function getManagedStartupProgress(healthReady = false) {
  const maxWaitMs = BACKEND_PACKAGED_HEALTH_RETRIES * BACKEND_PACKAGED_HEALTH_DELAY_MS;
  if (healthReady) {
    return { elapsedMs: maxWaitMs, maxWaitMs, percent: 100 };
  }
  const spawnedAt = state.backendSpawnedAt;
  if (!spawnedAt) {
    return { elapsedMs: 0, maxWaitMs, percent: 0 };
  }
  const elapsedMs = Math.min(maxWaitMs, Math.max(0, Date.now() - spawnedAt));
  const percent = Math.min(99, Math.round((elapsedMs / maxWaitMs) * 100));
  return { elapsedMs, maxWaitMs, percent };
}

/**
 * Health check that only succeeds when this app's managed backend child is running.
 * Used by the renderer instead of raw /health (which can succeed on a stale foreign process).
 *
 * @returns {Promise<{ ok: boolean; managed: boolean; reason?: string; startupProgress?: { elapsedMs: number; maxWaitMs: number; percent: number } }>}
 */
async function getManagedBackendStatus() {
  if (IS_DEV && process.env.SKIP_BACKEND === "1") {
    return {
      ok: true,
      managed: false,
      reason: "skip_backend",
      startupProgress: getManagedStartupProgress(true),
    };
  }

  const healthOk = () => probeBackendHealth(2500);

  const managedStartupMaxMs = BACKEND_PACKAGED_HEALTH_RETRIES * BACKEND_PACKAGED_HEALTH_DELAY_MS;

  if (state.backendStartupGiveUp) {
    if (await healthOk()) {
      state.backendStartupGiveUp = false;
      state.backendCrashCount = 0;
      const managed = healthBelongsToManagedBackend();
      return {
        ok: true,
        managed,
        reason: managed ? undefined : "adopted_listener",
        startupProgress: getManagedStartupProgress(true),
      };
    }
    if (state.backendCrashCount >= BACKEND_MAX_CRASHES_BEFORE_GIVE_UP) {
      return {
        ok: false,
        managed: false,
        reason: "exited",
        startupProgress: getManagedStartupProgress(false),
      };
    }
    return {
      ok: false,
      managed: false,
      reason: "health_timeout",
      startupProgress: getManagedStartupProgress(false),
    };
  }

  const healthUp = await healthOk();

  if (healthUp && !healthBelongsToManagedBackend()) {
    // Child handle was lost (or a doomed bind-fail spawn exited) but the API
    // is still serving. Do not kill it — that is what produced "fetch failed"
    // mid Gmail import.
    state.backendCrashCount = 0;
    return {
      ok: true,
      managed: false,
      reason: "adopted_listener",
      startupProgress: getManagedStartupProgress(true),
    };
  }

  if (!healthBelongsToManagedBackend()) {
    ensureBackendRunning();
  }

  if (healthUp && healthBelongsToManagedBackend()) {
    state.backendCrashCount = 0;
    return { ok: true, managed: true, startupProgress: getManagedStartupProgress(true) };
  }

  if (
    healthBelongsToManagedBackend() &&
    state.backendSpawnedAt > 0 &&
    Date.now() - state.backendSpawnedAt > managedStartupMaxMs
  ) {
    console.warn(
      "[backend] /health still pending after cold-start window — PyInstaller first launch can take several minutes; continuing to wait"
    );
    return {
      ok: false,
      managed: true,
      reason: "starting",
      startupProgress: getManagedStartupProgress(false),
    };
  }

  if (!healthBelongsToManagedBackend() && !healthUp) {
    const retryHealth = await healthOk();
    const poll = decideStatusPollRecovery({
      healthUp: retryHealth,
      listenerCount: findPortListeners().size,
    });
    if (poll.ok) {
      state.backendCrashCount = 0;
      return {
        ok: true,
        managed: false,
        reason: "adopted_listener",
        startupProgress: getManagedStartupProgress(true),
      };
    }
    if (poll.spawn) {
      ensureBackendRunning();
      await delay(800);
      if ((await healthOk()) && healthBelongsToManagedBackend()) {
        state.backendCrashCount = 0;
        return { ok: true, managed: true, startupProgress: getManagedStartupProgress(true) };
      }
    }
    return {
      ok: false,
      managed: false,
      reason: poll.reason || "starting",
      startupProgress: getManagedStartupProgress(false),
    };
  }

  return {
    ok: false,
    managed: true,
    reason: "starting",
    startupProgress: getManagedStartupProgress(false),
  };
}

module.exports = {
  forceKillTree,
  killBackendAndWait,
  killBackend,
  healthBelongsToManagedBackend,
  probeBackendHealth,
  freeBackendPort,
  waitForBackend,
  ensureBackendRunning,
  restartBackend,
  getManagedStartupProgress,
  getManagedBackendStatus,
};
