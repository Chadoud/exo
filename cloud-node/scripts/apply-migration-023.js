#!/usr/bin/env node
/**
 * Apply migration 023 — sync_changes feed + pairing grants.
 *
 * Usage:
 *   node scripts/apply-migration-023.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-023", "023_sync_changes.sql");
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sync_changes'",
  );
  console.log("[migration-023] sync_changes present:", Number(rows[0]?.n || 0) === 1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
