/**
 * Reconcile local subscription state against Stripe — the self-healing net
 * under the webhook: a missed/dropped event surfaces here within one cycle
 * instead of when a paying customer complains.
 *
 * Used by scripts/reconcile-subscriptions.js (CLI) and the in-process
 * scheduler started from server.js.
 */

const { getStripe, applySubscriptionState, ENTITLED_STATUS_SQL_LIST, billingEnabled } = require("./stripeBilling");

// Scan scope, not entitlement: 'incomplete' rows are also re-checked because
// they may have resolved to active/canceled at Stripe without a webhook.
const SCAN_STATUS_SQL_LIST = `${ENTITLED_STATUS_SQL_LIST},'incomplete'`;

const DEFAULT_INTERVAL_HOURS = 24;
/** First scheduled run waits for boot to settle (deploy restarts, DB warmup). */
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

/**
 * Re-fetch every live-ish subscription from Stripe and re-apply drifted state.
 * @param {{ pool: import("mysql2/promise").Pool, stripe: object }} deps
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<{ checked: number; drifted: number; fixed: number }>}
 */
async function reconcileSubscriptions(deps, opts = {}) {
  const { pool, stripe } = deps;
  const dryRun = Boolean(opts.dryRun);

  const [rows] = await pool.query(
    `SELECT account_id, stripe_subscription_id, status
     FROM subscriptions
     WHERE status IN (${SCAN_STATUS_SQL_LIST})`,
  );
  console.log(`[reconcile] checking ${rows.length} live-ish subscription(s)`);

  let drifted = 0;
  let fixed = 0;
  for (const row of rows) {
    let remote;
    try {
      remote = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    } catch {
      remote = { id: row.stripe_subscription_id, status: "canceled" };
    }
    if (remote.status === row.status) continue;
    drifted += 1;
    console.error(
      `[billing] ALERT reconcile drift ${row.stripe_subscription_id}: local=${row.status} stripe=${remote.status}${dryRun ? " (dry-run, not fixed)" : " — webhook was missed, state re-applied"}`,
    );
    if (dryRun) continue;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Epoch "now" outranks any previously applied webhook event.
      await applySubscriptionState(conn, row.account_id, remote, Math.floor(Date.now() / 1000));
      await conn.commit();
      fixed += 1;
    } catch (err) {
      await conn.rollback();
      console.error(`[reconcile] failed to fix ${row.stripe_subscription_id}:`, err?.message || err);
    } finally {
      conn.release();
    }
  }
  console.log(`[reconcile] done — ${drifted} drifted, ${dryRun ? "0 fixed (dry-run)" : `${fixed} fixed`}`);
  return { checked: rows.length, drifted, fixed };
}

/**
 * Nightly in-process reconciliation (no external cron on shared hosting).
 * No-op when billing is off or STRIPE_RECONCILE_INTERVAL_HOURS=0.
 */
function startSubscriptionReconciliation() {
  if (!billingEnabled()) return null;
  const hours = Number(process.env.STRIPE_RECONCILE_INTERVAL_HOURS ?? DEFAULT_INTERVAL_HOURS);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.log("[reconcile] scheduler disabled (STRIPE_RECONCILE_INTERVAL_HOURS)");
    return null;
  }

  const run = async () => {
    try {
      const pool = require("./db").getPool();
      await reconcileSubscriptions({ pool, stripe: getStripe() });
    } catch (err) {
      console.error("[billing] ALERT scheduled reconcile failed:", err?.message || err);
    }
  };

  // Timers are unref'd so a pending run never blocks process shutdown.
  const first = setTimeout(() => {
    void run();
    const interval = setInterval(run, hours * 60 * 60 * 1000);
    interval.unref();
  }, FIRST_RUN_DELAY_MS);
  first.unref();
  console.log(`[reconcile] scheduled every ${hours}h (first run in ${FIRST_RUN_DELAY_MS / 60000}min)`);
  return first;
}

module.exports = { reconcileSubscriptions, startSubscriptionReconciliation };
