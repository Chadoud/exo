/**
 * Offline license keys are device-bound at activate time. When the desktop
 * also sends a session, attach a paid sort entitlement so cloud credentials
 * unlock after the free trial ends.
 */

const { getPool } = require("./db");

const FEATURE = "sort";
const SOURCE = "offline_license";

/**
 * @param {string} accountId
 * @param {string} licenseId
 */
async function upsertOfflineLicenseEntitlement(accountId, licenseId) {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO entitlements (account_id, feature, source, active, extra)
     VALUES (?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE active = 1, extra = VALUES(extra)`,
    [accountId, FEATURE, SOURCE, JSON.stringify({ license_id: licenseId })],
  );
}

/**
 * @param {string} accountId
 */
async function clearOfflineLicenseEntitlement(accountId) {
  const pool = getPool();
  await pool.execute(
    `UPDATE entitlements SET active = 0
     WHERE account_id = ? AND feature = ? AND source = ?`,
    [accountId, FEATURE, SOURCE],
  );
}

module.exports = {
  FEATURE,
  SOURCE,
  upsertOfflineLicenseEntitlement,
  clearOfflineLicenseEntitlement,
};
