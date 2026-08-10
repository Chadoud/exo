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
    await conn.execute("DELETE FROM telemetry_events WHERE account_id = ?", [accountId]);
    await conn.execute("DELETE FROM product_feedback WHERE account_id = ?", [accountId]);
    await conn.execute("DELETE FROM crash_reports WHERE account_id = ?", [accountId]);
    try {
      await conn.execute("DELETE FROM app_sessions WHERE account_id = ?", [accountId]);
    } catch (e) {
      if (e?.code !== "ER_NO_SUCH_TABLE") {
        throw e;
      }
    }
    try {
      await conn.execute("INSERT INTO accounts_deleted_at (account_id_hash) VALUES (?)", [accountHash]);
    } catch (e) {
      if (e?.code !== "ER_NO_SUCH_TABLE") {
        throw e;
      }
    }
    const tables = [
      "DELETE FROM stripe_events_processed WHERE account_id = ?",
      "DELETE FROM subscriptions WHERE account_id = ?",
      "DELETE FROM whatsapp_events WHERE account_id = ?",
      "DELETE FROM whatsapp_phone_bindings WHERE account_id = ?",
      "DELETE FROM sync_blobs WHERE account_id = ?",
      "DELETE FROM sync_cursors WHERE account_id = ?",
      "DELETE FROM sync_devices WHERE account_id = ?",
      "DELETE FROM auth_exchange_codes WHERE account_id = ?",
      "DELETE FROM auth_identities WHERE account_id = ?",
      "DELETE FROM user_profiles WHERE account_id = ?",
      "DELETE FROM product_admins WHERE account_id = ?",
      "DELETE FROM entitlements WHERE account_id = ?",
      "DELETE FROM wallets WHERE account_id = ?",
      "DELETE FROM accounts WHERE id = ?",
    ];
    for (const sql of tables) {
      try {
        await conn.execute(sql, [accountId]);
      } catch (e) {
        if (/whatsapp_|stripe_events_processed|FROM subscriptions/.test(sql) && e?.code === "ER_NO_SUCH_TABLE") {
          continue;
        }
        throw e;
      }
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { exportAccountData, deleteAccount };
