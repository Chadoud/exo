#!/usr/bin/env node
/**
 * Apply migration 026 — password reset tokens.
 *
 * Usage:
 *   node scripts/apply-migration-026.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-026", "026_password_reset.sql");
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'password_reset_tokens'",
  );
  console.log("[migration-026] password_reset_tokens table present:", Number(rows[0]?.n || 0) === 1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
