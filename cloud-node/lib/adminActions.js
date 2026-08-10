/**
 * Mutating admin support actions (product-admin allowlist only; see
 * routes/admin.js for the auth gate). Every action writes an admin_audit row
 * in the same transaction as the change — no unaudited mutation can exist.
 */

const { applySubscriptionState } = require("./stripeBilling");

const TRIAL_EXTEND_MIN_DAYS = 1;
const TRIAL_EXTEND_MAX_DAYS = 90;

/**
 * @param {import("mysql2/promise").PoolConnection} conn open transaction
 */
async function recordAdminAudit(conn, adminAccountId, action, targetAccountId, details) {
  await conn.execute(
    "INSERT INTO admin_audit (admin_account_id, action, target_account_id, details) VALUES (?, ?, ?, ?)",
    [adminAccountId, action, targetAccountId, JSON.stringify(details)],
  );
}

/**
 * Extend the target's trial by a bounded number of days, counted from the
 * later of "now" and the current trial end — works for both active and
 * already-expired trials. Only relative days are accepted, never a date.
 *
 * @returns {Promise<{ ok: true; trial_ends_at: string } | { ok: false; error: string }>}
 */
async function extendTrial(pool, { adminAccountId, targetAccountId, days }) {
  if (!Number.isInteger(days) || days < TRIAL_EXTEND_MIN_DAYS || days > TRIAL_EXTEND_MAX_DAYS) {
    return { ok: false, error: "invalid_days" };
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `UPDATE accounts
       SET trial_ends_at = DATE_ADD(GREATEST(COALESCE(trial_ends_at, UTC_TIMESTAMP()), UTC_TIMESTAMP()), INTERVAL ? DAY)
       WHERE id = ? AND is_active = 1`,
      [days, targetAccountId],
    );
    if (!result.affectedRows) {
      await conn.rollback();
      return { ok: false, error: "account_not_found" };
    }
    const [rows] = await conn.execute(
      "SELECT trial_ends_at FROM accounts WHERE id = ? LIMIT 1",
      [targetAccountId],
    );
    const trialEndsAt = new Date(rows[0].trial_ends_at).toISOString();
    await recordAdminAudit(conn, adminAccountId, "extend_trial", targetAccountId, {
      days,
      trial_ends_at: trialEndsAt,
    });
    await conn.commit();
    return { ok: true, trial_ends_at: trialEndsAt };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Re-fetch every known subscription of the target from Stripe and re-apply
 * state — the per-account version of the nightly reconcile, for "customer
 * paid but shows trial ended" support calls.
 *
 * @returns {Promise<{ ok: true; subscriptions: Array<{ id: string; status: string }> }>}
 */
async function resyncSubscription(pool, stripe, { adminAccountId, targetAccountId }) {
  const [rows] = await pool.query(
    "SELECT stripe_subscription_id, status FROM subscriptions WHERE account_id = ?",
    [targetAccountId],
  );

  const results = [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      let remote;
      try {
        remote = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      } catch {
        remote = { id: row.stripe_subscription_id, status: "canceled" };
      }
      // Epoch "now" outranks any previously applied webhook event.
      await applySubscriptionState(conn, targetAccountId, remote, Math.floor(Date.now() / 1000));
      results.push({ id: remote.id, status: remote.status });
    }
    await recordAdminAudit(conn, adminAccountId, "resync_subscription", targetAccountId, {
      subscriptions: results,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { ok: true, subscriptions: results };
}

module.exports = { extendTrial, resyncSubscription, TRIAL_EXTEND_MAX_DAYS };
