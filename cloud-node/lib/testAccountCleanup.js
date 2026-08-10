/**
 * Remove automated smoke-test accounts from production MariaDB.
 *
 * Targets verify/GA scripts that POST /auth/register with throwaway emails.
 * Never deletes accounts on the protected list.
 */

const { getPool } = require("./db");

/** @type {readonly string[]} */
const PROTECTED_EMAILS = ["ga-verify@exosites.ch"];

/**
 * @param {import("mysql2/promise").Pool} pool
 * @returns {Promise<string[]>}
 */
async function listTrashAccountIds(pool) {
  const protectedPlaceholders = PROTECTED_EMAILS.map(() => "?").join(", ");
  const sql = `
    SELECT id, email
    FROM accounts
    WHERE (
      email LIKE '%@example.com'
      OR email = 'a@b.com'
    )
    AND email NOT IN (${protectedPlaceholders || "''"})
    ORDER BY created_at ASC`;
  const [rows] = await pool.execute(sql, [...PROTECTED_EMAILS]);
  return rows.map((row) => String(row.id));
}

/**
 * Permanently delete one account and all linked cloud rows.
 *
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} accountId
 */
async function deleteAccountRows(conn, accountId) {
  const statements = [
    "DELETE FROM whatsapp_events WHERE account_id = ?",
    "DELETE FROM whatsapp_phone_bindings WHERE account_id = ?",
    "DELETE FROM sync_changes WHERE account_id = ?",
    "DELETE FROM sync_pairing_grants WHERE account_id = ?",
    "DELETE FROM sync_blobs WHERE account_id = ?",
    "DELETE FROM sync_cursors WHERE account_id = ?",
    "DELETE FROM sync_devices WHERE account_id = ?",
    "DELETE FROM auth_exchange_codes WHERE account_id = ?",
    "DELETE FROM auth_identities WHERE account_id = ?",
    "DELETE FROM user_profiles WHERE account_id = ?",
    "DELETE FROM entitlements WHERE account_id = ?",
    "DELETE FROM wallets WHERE account_id = ?",
    "DELETE FROM accounts WHERE id = ?",
  ];
  for (const sql of statements) {
    try {
      await conn.execute(sql, [accountId]);
    } catch (err) {
      // whatsapp_* tables may be absent on older deployments
      if (/whatsapp_/.test(sql) && err?.code === "ER_NO_SUCH_TABLE") {
        continue;
      }
      throw err;
    }
  }
}

/**
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{ matched: number; deleted: number; dryRun: boolean }>}
 */
async function cleanupTestAccounts(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const pool = getPool();
  const ids = await listTrashAccountIds(pool);

  if (dryRun || ids.length === 0) {
    return { matched: ids.length, deleted: 0, dryRun };
  }

  let deleted = 0;
  for (const accountId of ids) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await deleteAccountRows(conn, accountId);
      await conn.commit();
      deleted += 1;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  return { matched: ids.length, deleted, dryRun: false };
}

module.exports = {
  PROTECTED_EMAILS,
  listTrashAccountIds,
  cleanupTestAccounts,
};
