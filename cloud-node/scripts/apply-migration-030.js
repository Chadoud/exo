#!/usr/bin/env node
/**
 * Apply migration 030 — store billing foundation.
 *
 * One-shot: if `store_billing_exempt` was missing, existing accounts become
 * exempt after the ALTER. Re-apply must not UPDATE again (new signups stay 0).
 *
 * Usage:
 *   node scripts/apply-migration-030.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return rows.length > 0;
}

async function main() {
  const pool = getPool();
  const hadExempt = await columnExists(pool, "accounts", "store_billing_exempt");
  await applySqlFileSafe(pool, "migration-030", "030_store_billing.sql");

  if (!hadExempt) {
    const [result] = await pool.query(
      "UPDATE accounts SET store_billing_exempt = 1 WHERE store_billing_exempt = 0",
    );
    console.log("[migration-030] grandfathered existing accounts:", result.affectedRows ?? 0);
  } else {
    console.log("[migration-030] store_billing_exempt already present — skipped grandfather UPDATE");
  }

  const [subs] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'store_subscriptions'",
  );
  console.log("[migration-030] store_subscriptions present:", Number(subs[0]?.n || 0) === 1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
