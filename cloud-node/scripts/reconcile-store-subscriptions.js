#!/usr/bin/env node
/**
 * On-demand App Store / Play reconciliation.
 *
 * Usage:
 *   node scripts/reconcile-store-subscriptions.js
 *   node scripts/reconcile-store-subscriptions.js --dry-run
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { getPool } = require("../lib/db");
const { reconcileStoreSubscriptions } = require("../lib/reconcileStoreSubscriptions");

reconcileStoreSubscriptions({ pool: getPool() }, { dryRun: process.argv.includes("--dry-run") })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
