#!/usr/bin/env node
/**
 * Apply migration 031 — store lifecycle retention (retired bind).
 *
 * Usage:
 *   node scripts/apply-migration-031.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-031", "031_store_lifecycle.sql");

  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM store_subscriptions LIKE 'account_id'");
    if (cols[0] && String(cols[0].Null).toUpperCase() === "NO") {
      await pool.query("ALTER TABLE store_subscriptions MODIFY account_id CHAR(36) NULL");
      console.log("[migration-031] store_subscriptions.account_id is now nullable");
    }
  } catch (e) {
    if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
    console.log("[migration-031] store_subscriptions missing — apply 030 first");
  }

  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'store_subscriptions' AND column_name = 'retired'",
  );
  console.log("[migration-031] store_subscriptions.retired present:", Number(rows[0]?.n || 0) === 1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
