/**
 * Account data export and erasure (GDPR-oriented).
 */

const crypto = require("crypto");
const { getPool } = require("./db");
const { getProfile } = require("./accounts");
const { cancelSubscriptionsForAccountDeletion } = require("./stripeBilling");

/**
 * Export cloud-held metadata for an account (no plaintext sync payloads).
 * @param {string} accountId
 */
async function exportAccountData(accountId) {
  const pool = getPool();
  const profile = await getProfile(accountId);
  if (!profile) {
    const err = new Error("account_not_found");
    err.status = 404;
    throw err;
  }

  const [devices] = await pool.execute(
    "SELECT id, name, platform, created_at, updated_at FROM sync_devices WHERE account_id = ?",
    [accountId],
  );
  const [blobMeta] = await pool.execute(
    `SELECT collection, record_id, updated_at, deleted, content_hash, created_at
     FROM sync_blobs WHERE account_id = ? ORDER BY id ASC LIMIT 5000`,
    [accountId],
  );
  const [identities] = await pool.execute(
    "SELECT provider, provider_subject, email_at_link, created_at FROM auth_identities WHERE account_id = ?",
    [accountId],
  );

  return {
    exported_at: new Date().toISOString(),
    account: profile,
    auth_identities: identities,
    sync_devices: devices,
    sync_blobs_metadata: blobMeta,
    note: "Ciphertext blobs are included as metadata only; decryption requires the user's device master key.",
  };
}

/**
 * Tables scoped by `account_id`, deleted in this order for every account
 * deletion. `optional: true` marks a table that may not exist yet on a
 * deployment that hasn't applied its migration — that one failure mode
 * (`ER_NO_SUCH_TABLE`) is swallowed for those tables; every other error, and
 * every non-optional table, still aborts the transaction.
 */
const ACCOUNT_SCOPED_TABLES = [
  { table: "telemetry_events" },
  { table: "product_feedback" },
  { table: "crash_reports" },
  { table: "app_sessions", optional: true },
  { table: "stripe_events_processed", optional: true }, // migration 024
  { table: "subscriptions", optional: true }, // migration 024
  { table: "whatsapp_events", optional: true },
  { table: "whatsapp_phone_bindings", optional: true },
  { table: "sync_changes", optional: true }, // migration 023
  { table: "sync_pairing_grants", optional: true }, // migration 023
  { table: "sync_blobs" },
  { table: "sync_cursors" },
  { table: "sync_devices" },
  { table: "auth_exchange_codes" },
  { table: "auth_identities" },
  { table: "user_profiles" },
  { table: "product_admins" },
  { table: "entitlements" },
  { table: "wallets" },
];

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} accountId
 * @param {{ table: string, optional?: boolean }} entry
 */
async function deleteAccountScopedRow(conn, accountId, { table, optional }) {
  try {
    await conn.execute(`DELETE FROM ${table} WHERE account_id = ?`, [accountId]);
  } catch (e) {
    if (optional && e?.code === "ER_NO_SUCH_TABLE") {
      return;
    }
    throw e;
  }
}

/**
 * Permanently delete an account and all linked cloud rows.
 * @param {string} accountId
 */
async function deleteAccount(accountId) {
  const pool = getPool();
  // A deleted account must never keep getting billed (no refund by default).
  try {
    await cancelSubscriptionsForAccountDeletion(accountId);
  } catch (e) {
    console.error("[account-delete] subscription cancel step failed:", e?.message || e);
  }
  const conn = await pool.getConnection();
  const accountHash = crypto.createHash("sha256").update(String(accountId)).digest("hex");
  try {
    await conn.beginTransaction();
    for (const entry of ACCOUNT_SCOPED_TABLES) {
      await deleteAccountScopedRow(conn, accountId, entry);
    }
    try {
      await conn.execute("INSERT INTO accounts_deleted_at (account_id_hash) VALUES (?)", [accountHash]);
    } catch (e) {
      if (e?.code !== "ER_NO_SUCH_TABLE") {
        throw e;
      }
    }
    await conn.execute("DELETE FROM accounts WHERE id = ?", [accountId]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { exportAccountData, deleteAccount };
