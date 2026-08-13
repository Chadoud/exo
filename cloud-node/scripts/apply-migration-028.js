#!/usr/bin/env node
/**
 * Apply migration 028 — email verification tokens.
 *
 * Usage:
 *   node scripts/apply-migration-028.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-028", "028_email_verification.sql");
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'email_verification_tokens'",
  );
  console.log("[migration-028] email_verification_tokens table present:", Number(rows[0]?.n || 0) === 1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
