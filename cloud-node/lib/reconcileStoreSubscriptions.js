/**
 * Reconcile store_subscriptions against Apple / Play — same net as Stripe reconcile.
 * Alerts on drift; never logs receipts, tokens, names, or email.
 */

const { appleCredentialsReady, fetchAppleSubscriptionTruth } = require("./storeApple");
const { playCredentialsReady, fetchPlaySubscriptionTruth } = require("./storePlay");
const { applyLiveStoreTruth } = require("./storeWebhook");
const { SCAN_STORE_STATUSES } = require("./storeStatus");

const DEFAULT_INTERVAL_HOURS = 24;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

function storeLifecycleReady() {
  return appleCredentialsReady() || playCredentialsReady();
}

/**
 * @param {{ pool: import("mysql2/promise").Pool, fetchApple?: Function, fetchPlay?: Function }} deps
 * @param {{ dryRun?: boolean }} [opts]
 */
async function reconcileStoreSubscriptions(deps, opts = {}) {
  const { pool } = deps;
  const dryRun = Boolean(opts.dryRun);
  const fetchApple = deps.fetchApple || ((poke) => fetchAppleSubscriptionTruth(poke, deps));
  const fetchPlay = deps.fetchPlay || ((poke) => fetchPlaySubscriptionTruth(poke, deps));

  const placeholders = SCAN_STORE_STATUSES.map(() => "?").join(",");
  let rows = [];
  try {
    const [found] = await pool.query(
      `SELECT account_id, platform, store_original_id, status, environment
       FROM store_subscriptions
       WHERE retired = 0 AND account_id IS NOT NULL AND status IN (${placeholders})`,
      SCAN_STORE_STATUSES,
    );
    rows = found;
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR") {
      return { checked: 0, drifted: 0, fixed: 0 };
    }
    throw e;
  }
  console.log(`[store-reconcile] checking ${rows.length} live-ish store subscription(s)`);

  let drifted = 0;
  let fixed = 0;
  for (const row of rows) {
    let remote;
    try {
      remote =
        row.platform === "play"
          ? await fetchPlay({ purchaseToken: row.store_original_id, environment: row.environment })
          : await fetchApple({ storeOriginalId: row.store_original_id, environment: row.environment });
    } catch {
      remote = {
        storeOriginalId: row.store_original_id,
        productId: "",
        status: "expired",
        environment: row.environment,
        expiresAt: null,
        autoRenew: false,
      };
    }
    if (remote.status === row.status) continue;
    drifted += 1;
    console.error(
      `[billing] ALERT store reconcile drift ${row.platform}: local=${row.status} remote=${remote.status}${dryRun ? " (dry-run, not fixed)" : " — notification was missed, state re-applied"}`,
    );
    if (dryRun) continue;
    try {
      await applyLiveStoreTruth(pool, row.account_id, row.platform, remote);
      fixed += 1;
    } catch (err) {
      console.error(`[store-reconcile] failed to fix ${row.platform} row:`, err?.message || err);
    }
  }
  console.log(
    `[store-reconcile] done — ${drifted} drifted, ${dryRun ? "0 fixed (dry-run)" : `${fixed} fixed`}`,
  );
  return { checked: rows.length, drifted, fixed };
}

function startStoreSubscriptionReconciliation() {
  if (!storeLifecycleReady()) return null;
  const hours = Number(process.env.STORE_RECONCILE_INTERVAL_HOURS ?? DEFAULT_INTERVAL_HOURS);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.log("[store-reconcile] scheduler disabled (STORE_RECONCILE_INTERVAL_HOURS)");
    return null;
  }

  const run = async () => {
    try {
      const pool = require("./db").getPool();
      await reconcileStoreSubscriptions({ pool });
    } catch (err) {
      console.error("[billing] ALERT scheduled store reconcile failed:", err?.message || err);
    }
  };

  const first = setTimeout(() => {
    void run();
    const interval = setInterval(run, hours * 60 * 60 * 1000);
    interval.unref();
  }, FIRST_RUN_DELAY_MS);
  first.unref();
  console.log(`[store-reconcile] scheduled every ${hours}h (first run in ${FIRST_RUN_DELAY_MS / 60000}min)`);
  return first;
}

module.exports = {
  storeLifecycleReady,
  reconcileStoreSubscriptions,
  startStoreSubscriptionReconciliation,
};
