#!/usr/bin/env node
/**
 * Support CLI: look up an account by email against the admin API.
 *
 * Usage:
 *   EXO_ADMIN_EMAIL=you@exosites.com EXO_ADMIN_PASSWORD=... \
 *     node scripts/admin-lookup.js customer@example.com [--api https://api.exosites.ch]
 *
 * The signed-in account must be on the product_admins allowlist.
 */

const email = process.argv[2];
const apiFlag = process.argv.indexOf("--api");
const apiBase = (apiFlag !== -1 && process.argv[apiFlag + 1]) || "https://api.exosites.ch";

const adminEmail = process.env.EXO_ADMIN_EMAIL;
const adminPassword = process.env.EXO_ADMIN_PASSWORD;

if (!email || !adminEmail || !adminPassword) {
  console.error("Usage: EXO_ADMIN_EMAIL=... EXO_ADMIN_PASSWORD=... node scripts/admin-lookup.js <email> [--api <base>]");
  process.exit(2);
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

  const res = await fetch(
    `${apiBase}/v1/admin/account-lookup?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json().catch(() => ({}));
  if (res.status === 404 && body.detail === "Not found") {
    console.error("Forbidden — this account is not on the product_admins allowlist.");
    process.exit(1);
  }
  if (res.status === 404) {
    console.log(`No account for ${email}.`);
    return;
  }
  if (!res.ok) {
    console.error(`Lookup failed (${res.status}):`, body.detail || body);
    process.exit(1);
  }
  console.log(JSON.stringify(body.account, null, 2));
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
