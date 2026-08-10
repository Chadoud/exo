const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { createMockStripe } = require("./helpers/mockStripe");

process.env.JWT_SECRET = "admin-routes-test-secret";

const ADMIN = "admin-0000-0000-0000-000000000001";
const USER = "user-0000-0000-0000-000000000002";
const TARGET = "target-0000-0000-0000-000000000003";

/**
 * accounts/productAdmins destructure getPool at require time, so the db module
 * must be patched before the router (and its dependency chain) is re-required.
 */
function mountAdminRouterWithMock(mock, overrides = {}) {
  for (const mod of ["../routes/admin", "../lib/accounts", "../lib/productAdmins", "../lib/db"]) {
    delete require.cache[require.resolve(mod)];
  }
  const db = require("../lib/db");
  db.getPool = () => mock;
  const { createAdminRouter } = require("../routes/admin");
  const app = express();
  app.use(express.json());
  app.use("/v1", createAdminRouter(overrides));
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

test("extend-trial extends from the later of now and current end, and audits", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ADMIN, "admin@test.ch");
  pool.addProductAdmin(ADMIN);
  // Expired trial: extension counts from now, not from the stale end date.
  pool.addAccount(TARGET, "customer@test.ch", null, { trial_ends_at: "2026-01-01T00:00:00.000Z" });
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    const res = await server.fetch(`/v1/admin/accounts/${TARGET}/extend-trial`, {
      method: "POST",
      headers: { ...authHeaders(ADMIN), "Content-Type": "application/json" },
      body: JSON.stringify({ days: 30 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const endMs = Date.parse(body.trial_ends_at);
    const expectedMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(endMs - expectedMs) < 60_000, "trial end should be ~30 days from now");

    assert.equal(pool.state.adminAudit.length, 1);
    const audit = pool.state.adminAudit[0];
    assert.equal(audit.admin_account_id, ADMIN);
    assert.equal(audit.action, "extend_trial");
    assert.equal(audit.target_account_id, TARGET);
    assert.equal(JSON.parse(audit.details).days, 30);
  } finally {
    await server.close();
  }
});

test("extend-trial rejects out-of-bounds days and unknown targets", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ADMIN, "admin@test.ch");
  pool.addProductAdmin(ADMIN);
  pool.addAccount(TARGET, "customer@test.ch");
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    for (const days of [0, 91, -5, "30", null]) {
      const res = await server.fetch(`/v1/admin/accounts/${TARGET}/extend-trial`, {
        method: "POST",
        headers: { ...authHeaders(ADMIN), "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      assert.equal(res.status, 422, `days=${days} must be rejected`);
    }
    const missing = await server.fetch(`/v1/admin/accounts/acc-does-not-exist/extend-trial`, {
      method: "POST",
      headers: { ...authHeaders(ADMIN), "Content-Type": "application/json" },
      body: JSON.stringify({ days: 30 }),
    });
    assert.equal(missing.status, 404);
    assert.equal(pool.state.adminAudit.length, 0, "failed actions must not audit as success");
  } finally {
    await server.close();
  }
});

test("non-admin cannot invoke actions (generic 404)", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(USER, "user@test.ch");
  pool.addAccount(TARGET, "customer@test.ch");
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    const res = await server.fetch(`/v1/admin/accounts/${TARGET}/extend-trial`, {
      method: "POST",
      headers: { ...authHeaders(USER), "Content-Type": "application/json" },
      body: JSON.stringify({ days: 30 }),
    });
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { detail: "Not found" });
  } finally {
    await server.close();
  }
});

test("resync-subscription re-applies Stripe truth and audits", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ADMIN, "admin@test.ch");
  pool.addProductAdmin(ADMIN);
  pool.addAccount(TARGET, "customer@test.ch", "cus_resync");
  pool.state.subscriptions.push({
    id: 1,
    account_id: TARGET,
    stripe_subscription_id: "sub_resync",
    stripe_price_id: "price_monthly",
    status: "past_due",
    current_period_end: "2026-09-01T00:00:00.000Z",
    cancel_at_period_end: 0,
    last_event_created: 1,
    created_seq: 1,
    updated_seq: 1,
  });
  const stripe = createMockStripe();
  stripe._setSubscription({
    id: "sub_resync",
    status: "active",
    items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1_900_000_000 }] },
    cancel_at_period_end: false,
  });
  const server = await listenApp(mountAdminRouterWithMock(pool, { stripe }));
  try {
    const res = await server.fetch(`/v1/admin/accounts/${TARGET}/resync-subscription`, {
      method: "POST",
      headers: authHeaders(ADMIN),
    });
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).subscriptions, [{ id: "sub_resync", status: "active" }]);
    assert.equal(pool.state.subscriptions[0].status, "active");
    assert.equal(pool.state.adminAudit.length, 1);
    assert.equal(pool.state.adminAudit[0].action, "resync_subscription");
  } finally {
    await server.close();
  }
});

test("resync-subscription without configured billing returns 503", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ADMIN, "admin@test.ch");
  pool.addProductAdmin(ADMIN);
  pool.addAccount(TARGET, "customer@test.ch");
  // No stripe override: getStripe() throws billing_not_configured in tests.
  const server = await listenApp(mountAdminRouterWithMock(pool));
  try {
    const res = await server.fetch(`/v1/admin/accounts/${TARGET}/resync-subscription`, {
      method: "POST",
      headers: authHeaders(ADMIN),
    });
    assert.equal(res.status, 503);
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
