#!/usr/bin/env node
/**
 * CLI for on-demand subscription reconciliation (core lives in
 * lib/reconcileSubscriptions.js; the server also runs it nightly in-process).
 *
 * Usage:
 *   node scripts/reconcile-subscriptions.js            # apply fixes
 *   node scripts/reconcile-subscriptions.js --dry-run  # report only
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { getStripe } = require("../lib/stripeBilling");
const { reconcileSubscriptions } = require("../lib/reconcileSubscriptions");

reconcileSubscriptions(
  { pool: getPool(), stripe: getStripe() },
  { dryRun: process.argv.includes("--dry-run") },
)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
