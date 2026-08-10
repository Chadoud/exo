#!/usr/bin/env node
/**
 * Reconcile local subscription state against Stripe (self-heals missed webhooks).
 *
 * For every account with a subscriptions row in a live-ish status, re-fetches the
 * subscription from Stripe and re-applies it. Run nightly (cron) or on demand.
 *
 * Usage:
 *   node scripts/reconcile-subscriptions.js            # apply fixes
 *   node scripts/reconcile-subscriptions.js --dry-run  # report only
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { getStripe, applySubscriptionState } = require("../lib/stripeBilling");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();
  const stripe = getStripe();

  const [rows] = await pool.query(
    `SELECT account_id, stripe_subscription_id, status
     FROM subscriptions
     WHERE status IN ('active','trialing','past_due','incomplete')`,
  );
  console.log(`[reconcile] checking ${rows.length} live-ish subscription(s)`);

  let drifted = 0;
  for (const row of rows) {
    let remote;
    try {
      remote = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
    } catch {
      remote = { id: row.stripe_subscription_id, status: "canceled" };
    }
    if (remote.status === row.status) continue;
    drifted += 1;
    console.log(
      `[reconcile] drift ${row.stripe_subscription_id}: local=${row.status} stripe=${remote.status}${dryRun ? " (dry-run, not fixed)" : ""}`,
    );
    if (dryRun) continue;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Epoch "now" outranks any previously applied webhook event.
      await applySubscriptionState(conn, row.account_id, remote, Math.floor(Date.now() / 1000));
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error(`[reconcile] failed to fix ${row.stripe_subscription_id}:`, err?.message || err);
    } finally {
      conn.release();
    }
  }
  console.log(`[reconcile] done — ${drifted} drifted, ${dryRun ? "0 fixed (dry-run)" : `${drifted} fixed`}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
