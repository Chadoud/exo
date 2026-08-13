/**
 * Shared shape for single-use, hashed, TTL'd account tokens: a random
 * plaintext token is handed to the caller once; the DB only ever stores its
 * SHA-256 hash. Consumption is atomic (row-locked) and single-use.
 *
 * Backs passwordReset.js and emailVerification.js — same table shape
 * (token_hash, account_id, expires_at, consumed_at, created_at), different
 * table names, TTLs, and post-consume side effects (passed via `onConsume`).
 * Deliberately not merged with exchangeCodes.js, whose `consumed` boolean
 * column is a different (already-shipped) schema than `consumed_at`.
 */

const crypto = require("crypto");
const { getPool } = require("./db");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * @param {string} table table name — must already exist via its migration
 * @param {number} ttlSeconds
 */
function createTokenStore(table, ttlSeconds) {
  /**
   * @param {string} accountId
   * @returns {Promise<string>} the plaintext token (only ever returned once)
   */
  async function createToken(accountId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await getPool().execute(
      `INSERT INTO ${table} (token_hash, account_id, expires_at) VALUES (?, ?, ?)`,
      [hashToken(token), accountId, expiresAt],
    );
    return token;
  }

  /**
   * Atomically consume a token. Returns the account id, or null if the token
   * is missing, expired, or already used. `onConsume(conn, accountId)` runs
   * in the same transaction right before commit, for callers that need to
   * apply a side effect (e.g. mark an email verified) only on success.
   * @param {string} token
   * @param {{ onConsume?: (conn: import("mysql2/promise").PoolConnection, accountId: string) => Promise<void> }} [opts]
   * @returns {Promise<string | null>}
   */
  async function consumeToken(token, opts = {}) {
    const pool = getPool();
    const tokenHash = hashToken(token);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.execute(
        `SELECT account_id FROM ${table}
         WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()
         FOR UPDATE`,
        [tokenHash],
      );
      const row = rows[0];
      if (!row) {
        await conn.rollback();
        return null;
      }
      await conn.execute(`UPDATE ${table} SET consumed_at = UTC_TIMESTAMP() WHERE token_hash = ?`, [tokenHash]);
      if (opts.onConsume) {
        await opts.onConsume(conn, row.account_id);
      }
      await conn.commit();
      return row.account_id;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  return { createToken, consumeToken, ttlSeconds };
}

module.exports = { createTokenStore, hashToken };
