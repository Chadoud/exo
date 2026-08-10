const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { createBillingMockPool } = require("./helpers/mockBillingPool");

process.env.JWT_SECRET = "admin-routes-test-secret";

const ADMIN = "admin-0000-0000-0000-000000000001";
const USER = "user-0000-0000-0000-000000000002";
const TARGET = "target-0000-0000-0000-000000000003";

/**
 * accounts/productAdmins destructure getPool at require time, so the db module
 * must be patched before the router (and its dependency chain) is re-required.
 */
function mountAdminRouterWithMock(mock) {
  for (const mod of ["../routes/admin", "../lib/accounts", "../lib/productAdmins", "../lib/db"]) {
    delete require.cache[require.resolve(mod)];
  }
  const db = require("../lib/db");
  db.getPool = () => mock;
  const adminRouter = require("../routes/admin");
  const app = express();
  app.use(express.json());
  app.use("/v1", adminRouter);
  return app;
}

function authHeaders(accountId) {
  const { signAccessToken } = require("../lib/tokens");
  return { Authorization: `Bearer ${signAccessToken(accountId)}` };
}

function lookupUrl(email) {
  return `/v1/admin/account-lookup?email=${encodeURIComponent(email)}`;
}

test("admin lookup requires a bearer token", async () => {
  const server = await listenApp(mountAdminRouterWithMock(createBillingMockPool()));
  try {
    const res = await server.fetch(lookupUrl("someone@test.ch"));
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("non-admin gets the generic 404 (surface stays hidden)", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(USER, "user@test.ch");
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    const res = await server.fetch(lookupUrl("someone@test.ch"), { headers: authHeaders(USER) });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { detail: "Not found" });
  } finally {
    await server.close();
  }
});

test("admin lookup returns the canonical profile plus stripe customer id", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ADMIN, "admin@test.ch");
  pool.addProductAdmin(ADMIN);
  pool.addAccount(TARGET, "customer@test.ch", "cus_lookup_1");
  pool.state.subscriptions.push({
    id: 1,
    account_id: TARGET,
    stripe_subscription_id: "sub_lookup",
    stripe_price_id: "price_monthly",
    status: "active",
    current_period_end: "2026-09-01T00:00:00.000Z",
    cancel_at_period_end: 0,
    last_event_created: 1,
    created_seq: 1,
    updated_seq: 1,
  });
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    const res = await server.fetch(lookupUrl("Customer@Test.ch"), { headers: authHeaders(ADMIN) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.account.account_id, TARGET);
    assert.equal(body.account.plan, "pro");
    assert.equal(body.account.subscription_status, "active");
    assert.equal(body.account.stripe_customer_id, "cus_lookup_1");
    assert.equal(body.account.is_active, true);
  } finally {
    await server.close();
  }
});

test("unknown email returns account_not_found; bad email is rejected", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ADMIN, "admin@test.ch");
  pool.addProductAdmin(ADMIN);
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    const missing = await server.fetch(lookupUrl("nobody@test.ch"), { headers: authHeaders(ADMIN) });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { detail: "account_not_found" });

    const invalid = await server.fetch(lookupUrl("not-an-email"), { headers: authHeaders(ADMIN) });
    assert.equal(invalid.status, 422);
  } finally {
    await server.close();
  }
});

test("deactivated account returns a minimal record", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ADMIN, "admin@test.ch");
  pool.addProductAdmin(ADMIN);
  pool.addAccount(TARGET, "gone@test.ch", null, { is_active: 0 });
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    const res = await server.fetch(lookupUrl("gone@test.ch"), { headers: authHeaders(ADMIN) });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).account, { account_id: TARGET, is_active: false });
  } finally {
    await server.close();
  }
});

test("lookups are rate-limited per admin", async () => {
  const pool = createBillingMockPool();
  const admin = "admin-rate-limit-000000000009";
  pool.addAccount(admin, "ratelimit@test.ch");
  pool.addProductAdmin(admin);
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    let limited = null;
    for (let i = 0; i < 31; i += 1) {
      const res = await server.fetch(lookupUrl("nobody@test.ch"), { headers: authHeaders(admin) });
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    assert.ok(limited, "expected a 429 within 31 lookups");
  } finally {
    await server.close();
  }
});
