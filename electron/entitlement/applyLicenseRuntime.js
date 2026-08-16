/**
 * After a key is saved, the already-running backend and cloud must see it
 * immediately — Settings saying LICENSED while sort/sync still 402 is a bug.
 */

const cloudAuth = require("../cloudAuth");
const { getMachineFingerprint } = require("./machineId");
const { activateLicenseOnline, detachOfflineLicenseOnline } = require("./activateOnline");

const ATTACH_COOLDOWN_MS = 60_000;
let lastAttachAt = 0;

/**
 * Bind the saved key to the signed-in account so cloud sort credentials unlock.
 * @param {string} userData
 * @param {{ force?: boolean }} [opts]
 */
async function attachOfflineLicenseToCloudAccount(userData, opts = {}) {
  const force = opts.force === true;
  if (!force && lastAttachAt > 0 && Date.now() - lastAttachAt < ATTACH_COOLDOWN_MS) {
    return { skipped: "cooldown" };
  }
  const key = require("./store").readSavedLicenseKey(userData);
  if (!key) return { skipped: "no_key" };
  const sess = await cloudAuth.ensureFreshSession(userData);
  if (!sess?.access_token) return { skipped: "not_logged_in" };
  lastAttachAt = Date.now();
  return activateLicenseOnline(key, getMachineFingerprint(), sess.access_token);
}

/**
 * Restart the local backend, attach the license to the cloud account, refresh
 * sort credentials, and retry GO Sync so the UI does not stay on trial_expired.
 * @param {string} userData
 */
async function applySavedLicenseToRuntime(userData) {
  const { restartBackend } = require("../backendLifecycle");
  const { syncSortCredentialsFromCloud } = require("./sortCredentials");
  const syncWorker = require("../syncWorker");

  try {
    await restartBackend();
  } catch (err) {
    console.warn("[entitlement] backend restart after license failed:", err && err.message);
  }

  try {
    await attachOfflineLicenseToCloudAccount(userData, { force: true });
  } catch (err) {
    console.warn("[entitlement] cloud license attach failed:", err && err.message);
  }

  try {
    await syncSortCredentialsFromCloud(userData, { force: true });
  } catch (err) {
    console.warn("[entitlement] sort credentials after license failed:", err && err.message);
  }

  syncWorker.clearLastError();
  try {
    await syncWorker.runSyncOnce(userData);
  } catch (err) {
    console.warn("[entitlement] sync retry after license failed:", err && err.message);
  }
}

/**
 * Local key removed — drop the cloud offline_license row and restart the gate.
 * @param {string} userData
 */
async function revokeSavedLicenseRuntime(userData) {
  const { restartBackend } = require("../backendLifecycle");
  const sess = await cloudAuth.ensureFreshSession(userData);
  if (sess?.access_token) {
    try {
      await detachOfflineLicenseOnline(sess.access_token);
    } catch (err) {
      console.warn("[entitlement] cloud license detach failed:", err && err.message);
    }
  }
  try {
    await restartBackend();
  } catch (err) {
    console.warn("[entitlement] backend restart after license clear failed:", err && err.message);
  }
}

module.exports = {
  attachOfflineLicenseToCloudAccount,
  applySavedLicenseToRuntime,
  revokeSavedLicenseRuntime,
};
