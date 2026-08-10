process.env.JWT_SECRET = "billing-routes-test-secret";
process.env.STRIPE_PRICE_ID_MONTHLY = "price_monthly_test";
process.env.STRIPE_PRICE_ID_ANNUAL = "price_annual_test";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { createMockStripe } = require("./helpers/mockStripe");
const { createBillingRouter } = require("../routes/billing");
const { signAccessToken } = require("../lib/tokens");

// Unique account per test — the rate-limit bucket is keyed by account id
// and module-global, so shared ids would bleed across tests.
let accountCounter = 0;
function freshAccount() {
  accountCounter += 1;
  return `990e8400-e29b-41d4-a716-4466554400${String(accountCounter).padStart(2, "0")}`;
}

function authHeaders(accountId) {
  return {
    Authorization: `Bearer ${signAccessToken(accountId)}`,
    "Content-Type": "application/json",
  };
}

function buildApp(overrides) {
  const app = express();
  app.use(express.json());
  app.use("/v1", createBillingRouter({ enabled: true, ...overrides }));
  return app;
}

test("checkout-session requires a bearer token", async () => {
  const server = await listenApp(buildApp({ pool: createBillingMockPool(), stripe: createMockStripe() }));
  try {
    const res = await server.fetch("/v1/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: "monthly" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("checkout-session rejects unknown intervals with 422", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch");
  const server = await listenApp(buildApp({ pool, stripe: createMockStripe() }));
  try {
    const res = await server.fetch("/v1/billing/checkout-session", {
      method: "POST",
      headers: authHeaders(account),
      body: JSON.stringify({ interval: "weekly" }),
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).detail, "invalid_interval");
  } finally {
    await server.close();
  }
});

test("checkout-session happy path creates a customer bound to the JWT account", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "payer@test.ch");
  const stripe = createMockStripe();
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const res = await server.fetch("/v1/billing/checkout-session", {
      method: "POST",
      headers: authHeaders(account),
      // IDOR probe: client-supplied account/customer ids must be ignored.
      body: JSON.stringify({ interval: "monthly", account_id: "attacker", customer: "cus_evil" }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.checkout_url, /^https:\/\/checkout\.stripe\.com\//);

    const session = stripe._calls.checkoutSessions[0];
    assert.equal(session.client_reference_id, account);
    assert.equal(session.customer, pool.state.accounts[account].stripe_customer_id);
    assert.notEqual(session.customer, "cus_evil");
    assert.equal(stripe._customers.get(session.customer).email, "payer@test.ch");
  } finally {
    await server.close();
  }
});

test("checkout-session returns 409 when a live subscription exists", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch", "cus_existing");
  pool.state.subscriptions.push({
    id: 1,
    account_id: account,
    stripe_subscription_id: "sub_live",
    stripe_price_id: "price_m",
    status: "active",
    current_period_end: null,
    cancel_at_period_end: 0,
    last_event_created: 1,
    created_seq: 1,
    updated_seq: 1,
  });
  const server = await listenApp(buildApp({ pool, stripe: createMockStripe() }));
  try {
    const res = await server.fetch("/v1/billing/checkout-session", {
      method: "POST",
      headers: authHeaders(account),
      body: JSON.stringify({ interval: "annual" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).detail, "already_subscribed");
  } finally {
    await server.close();
  }
});

test("portal-session returns 404 before any subscription exists", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch");
  const server = await listenApp(buildApp({ pool, stripe: createMockStripe() }));
  try {
    const res = await server.fetch("/v1/billing/portal-session", {
      method: "POST",
      headers: authHeaders(account),
      body: "{}",
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).detail, "no_stripe_customer");
  } finally {
    await server.close();
  }
});

test("portal-session happy path returns the Stripe portal URL", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch", "cus_portal");
  const stripe = createMockStripe();
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const res = await server.fetch("/v1/billing/portal-session", {
      method: "POST",
      headers: authHeaders(account),
      body: "{}",
    });
    assert.equal(res.status, 200);
    assert.match((await res.json()).portal_url, /^https:\/\/billing\.stripe\.com\//);
    assert.equal(stripe._calls.portalSessions[0].customer, "cus_portal");
  } finally {
    await server.close();
  }
});

test("billing disabled returns 503 for both session routes", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch");
  const server = await listenApp(buildApp({ pool, stripe: createMockStripe(), enabled: false }));
  try {
    for (const path of ["/v1/billing/checkout-session", "/v1/billing/portal-session"]) {
      const res = await server.fetch(path, {
        method: "POST",
        headers: authHeaders(account),
        body: JSON.stringify({ interval: "monthly" }),
      });
      assert.equal(res.status, 503);
      assert.equal((await res.json()).detail, "billing_not_configured");
    }
  } finally {
    await server.close();
  }
});

test("session creation is rate limited per account", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch");
  const server = await listenApp(buildApp({ pool, stripe: createMockStripe() }));
  try {
    let lastStatus = 0;
    for (let i = 0; i < 11; i += 1) {
      const res = await server.fetch("/v1/billing/checkout-session", {
        method: "POST",
        headers: authHeaders(account),
        body: JSON.stringify({ interval: "monthly" }),
      });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429);
  } finally {
    await server.close();
  }
});

test("billing done/cancelled handoff pages render with exo:// deep links", async () => {
  const server = await listenApp(buildApp({ pool: createBillingMockPool(), stripe: createMockStripe() }));
  try {
    const done = await server.fetch("/v1/billing/done?session_id=cs_x");
    assert.equal(done.status, 200);
    const doneHtml = await done.text();
    assert.match(doneHtml, /exo:\/\/billing\/complete/);

    const cancelled = await server.fetch("/v1/billing/cancelled");
    assert.equal(cancelled.status, 200);
    assert.match(await cancelled.text(), /exo:\/\/billing\/cancelled/);
  } finally {
    await server.close();
  }
});
