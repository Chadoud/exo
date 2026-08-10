#!/usr/bin/env node
/**
 * Support CLI for audited admin actions.
 *
 * Usage:
 *   EXO_ADMIN_EMAIL=... EXO_ADMIN_PASSWORD=... \
 *     node scripts/admin-action.js extend-trial customer@example.com 30
 *     node scripts/admin-action.js resync customer@example.com
 *   [--api https://api.exosites.ch]
 *
 * The signed-in account must be on the product_admins allowlist. Every action
 * is recorded in the admin_audit table.
 */

const [action, email, daysArg] = process.argv.slice(2);
const apiFlag = process.argv.indexOf("--api");
const apiBase = (apiFlag !== -1 && process.argv[apiFlag + 1]) || "https://api.exosites.ch";

const adminEmail = process.env.EXO_ADMIN_EMAIL;
const adminPassword = process.env.EXO_ADMIN_PASSWORD;

const USAGE =
  "Usage: EXO_ADMIN_EMAIL=... EXO_ADMIN_PASSWORD=... node scripts/admin-action.js <extend-trial|resync> <email> [days]";

if (!["extend-trial", "resync"].includes(action) || !email || !adminEmail || !adminPassword) {
  console.error(USAGE);
  process.exit(2);
}

async function apiFetch(token, path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

async function main() {
  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (!loginRes.ok) {
    console.error(`Login failed (${loginRes.status}) — check EXO_ADMIN_EMAIL/EXO_ADMIN_PASSWORD.`);
    process.exit(1);
  }
  const { access_token: token } = await loginRes.json();

  const lookup = await apiFetch(token, `/v1/admin/account-lookup?email=${encodeURIComponent(email)}`);
  if (lookup.res.status === 404 && lookup.body.detail === "Not found") {
    console.error("Forbidden — this account is not on the product_admins allowlist.");
    process.exit(1);
  }
  if (!lookup.res.ok) {
    console.error(`Lookup failed (${lookup.res.status}):`, lookup.body.detail || lookup.body);
    process.exit(1);
  }
  const accountId = lookup.body.account.account_id;

  if (action === "extend-trial") {
    const days = Number(daysArg);
    if (!Number.isInteger(days) || days < 1) {
      console.error("extend-trial needs a positive integer <days> (max 90).");
      process.exit(2);
    }
    const { res, body } = await apiFetch(token, `/v1/admin/accounts/${accountId}/extend-trial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });
    if (!res.ok) {
      console.error(`extend-trial failed (${res.status}):`, body.detail || body);
      process.exit(1);
    }
    console.log(`Trial extended by ${days} day(s) → ends ${body.trial_ends_at}`);
    return;
  }

  const { res, body } = await apiFetch(token, `/v1/admin/accounts/${accountId}/resync-subscription`, {
    method: "POST",
  });
  if (!res.ok) {
    console.error(`resync failed (${res.status}):`, body.detail || body);
    process.exit(1);
  }
  if (!body.subscriptions.length) {
    console.log("No subscriptions on record for this account.");
    return;
  }
  for (const sub of body.subscriptions) {
    console.log(`${sub.id}: ${sub.status}`);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
