#!/usr/bin/env node
/**
 * Apply migration 024 — Stripe billing (customer id, subscriptions, webhook idempotency).
 *
 * Usage:
 *   node scripts/apply-migration-024.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-024", "024_stripe_billing.sql");
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('subscriptions', 'stripe_events_processed')",
  );
  console.log("[migration-024] billing tables present:", Number(rows[0]?.n || 0) === 2);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
