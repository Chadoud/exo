#!/usr/bin/env node
/**
 * Apply migration 027 — accounts.email_verified (backfilled to 1 for existing rows).
 *
 * Usage:
 *   node scripts/apply-migration-027.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-027", "027_email_verified.sql");
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'accounts' AND column_name = 'email_verified'",
  );
  console.log("[migration-027] accounts.email_verified column present:", Number(rows[0]?.n || 0) === 1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
