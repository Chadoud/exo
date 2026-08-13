#!/usr/bin/env node
/**
 * Apply migration 029 — license activations.
 *
 * Usage:
 *   node scripts/apply-migration-029.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { applySqlFileSafe } = require("./lib/applySqlFile");

async function main() {
  const pool = getPool();
  await applySqlFileSafe(pool, "migration-029", "029_license_activations.sql");
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'license_activations'",
  );
  console.log("[migration-029] license_activations table present:", Number(rows[0]?.n || 0) === 1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
