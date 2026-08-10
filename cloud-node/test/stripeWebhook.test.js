process.env.JWT_SECRET = "stripe-webhook-test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { createMockStripe, signedWebhook } = require("./helpers/mockStripe");
const { createStripeWebhookRouter } = require("../routes/billing");

const SECRET = "whsec_test_secret";
const ACCOUNT = "880e8400-e29b-41d4-a716-446655440003";
const CUSTOMER = "cus_mock_account";

let eventCounter = 0;

function makeEvent(type, object, overrides = {}) {
  eventCounter += 1;
  return {
    id: `evt_test_${eventCounter}`,
    type,
    created: 1_000_000 + eventCounter,
    livemode: false,
    data: { object },
    ...overrides,
  };
}

function subObject(id, status, overrides = {}) {
  return {
    id,
    status,
    customer: CUSTOMER,
    items: { data: [{ price: { id: "price_monthly_test" } }] },
    current_period_end: 1_900_000_000,
    cancel_at_period_end: false,
    ...overrides,
  };
}

function buildApp({ pool, stripe, webhookSecret = SECRET, isProduction = false }) {
  const app = express();
  app.use(
    "/v1/webhooks/stripe",
    express.raw({ type: "application/json", limit: "512kb" }),
    createStripeWebhookRouter({ pool, stripe, webhookSecret, isProduction }),
  );
  return app;
}

async function postWebhook(server, payload, header) {
  return server.fetch("/v1/webhooks/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": header },
    body: payload,
  });
}

test("valid signature: subscription.updated activates the entitlement", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  stripe._setSubscription(subObject("sub_hook_1", "active"));
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const event = makeEvent("customer.subscription.updated", subObject("sub_hook_1", "active"));
    const { payload, header } = signedWebhook(event, SECRET);
    const res = await postWebhook(server, payload, header);

    assert.equal(res.status, 200);
    const ent = pool.state.entitlements.find((e) => e.account_id === ACCOUNT && e.source === "stripe");
    assert.equal(ent.active, 1);
    assert.equal(pool.state.subscriptions[0].status, "active");
  } finally {
    await server.close();
  }
});

test("checkout.session.completed retrieves the subscription and entitles", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  stripe._setSubscription(subObject("sub_from_checkout", "active"));
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const event = makeEvent("checkout.session.completed", {
      id: "cs_done",
      customer: CUSTOMER,
      client_reference_id: ACCOUNT,
      subscription: "sub_from_checkout",
    });
    const { payload, header } = signedWebhook(event, SECRET);
    const res = await postWebhook(server, payload, header);

    assert.equal(res.status, 200);
    assert.equal(pool.state.subscriptions[0].stripe_subscription_id, "sub_from_checkout");
    const ent = pool.state.entitlements.find((e) => e.account_id === ACCOUNT && e.source === "stripe");
    assert.equal(ent.active, 1);
  } finally {
    await server.close();
  }
});

test("tampered body is rejected with 401", async () => {
  const pool = createBillingMockPool();
  const stripe = createMockStripe();
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const event = makeEvent("customer.subscription.updated", subObject("sub_x", "active"));
    const { payload, header } = signedWebhook(event, SECRET);
    const tampered = payload.replace("active", "hacked");
    const res = await postWebhook(server, tampered, header);

    assert.equal(res.status, 401);
    assert.equal(pool.state.subscriptions.length, 0);
  } finally {
    await server.close();
  }
});

test("replayed event id is a no-op (still 200)", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  stripe._setSubscription(subObject("sub_replay", "active"));
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const event = makeEvent("customer.subscription.updated", subObject("sub_replay", "active"));
    const { payload, header } = signedWebhook(event, SECRET);

    const first = await postWebhook(server, payload, header);
    assert.equal(first.status, 200);
    // Flip the mock state to prove the replay does not re-apply anything.
    pool.state.subscriptions[0].status = "sentinel";

    const second = await postWebhook(server, payload, header);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).deduped, true);
    assert.equal(pool.state.subscriptions[0].status, "sentinel");
  } finally {
    await server.close();
  }
});

test("missing webhook secret returns 503", async () => {
  const pool = createBillingMockPool();
  const stripe = createMockStripe();
  const server = await listenApp(buildApp({ pool, stripe, webhookSecret: "" }));
  try {
    const res = await postWebhook(server, "{}", "sig");
    assert.equal(res.status, 503);
  } finally {
    await server.close();
  }
});

test("livemode mismatch is acknowledged but ignored", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  const server = await listenApp(buildApp({ pool, stripe, isProduction: false }));
  try {
    const event = makeEvent("customer.subscription.updated", subObject("sub_live", "active"), {
      livemode: true,
    });
    const { payload, header } = signedWebhook(event, SECRET);
    const res = await postWebhook(server, payload, header);

    assert.equal(res.status, 200);
    assert.equal((await res.json()).ignored, "livemode_mismatch");
    assert.equal(pool.state.subscriptions.length, 0);
  } finally {
    await server.close();
  }
});

test("stale webhook after a newer one cannot regress state", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  // Stripe's current truth: the subscription is canceled.
  stripe._setSubscription(subObject("sub_ooo", "canceled"));
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const newer = makeEvent("customer.subscription.deleted", subObject("sub_ooo", "canceled"));
    const older = makeEvent("customer.subscription.updated", subObject("sub_ooo", "active"), {
      created: newer.created - 100,
    });

    const a = signedWebhook(newer, SECRET);
    await postWebhook(server, a.payload, a.header);
    const b = signedWebhook(older, SECRET);
    await postWebhook(server, b.payload, b.header);

    assert.equal(pool.state.subscriptions[0].status, "canceled");
    const ent = pool.state.entitlements.find((e) => e.account_id === ACCOUNT && e.source === "stripe");
    assert.equal(ent.active, 0);
  } finally {
    await server.close();
  }
});

test("unknown customer is acknowledged without state writes", async () => {
  const pool = createBillingMockPool();
  const stripe = createMockStripe();
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const event = makeEvent("customer.subscription.updated", subObject("sub_ghost", "active", { customer: "cus_unknown" }));
    const { payload, header } = signedWebhook(event, SECRET);
    const res = await postWebhook(server, payload, header);

    assert.equal(res.status, 200);
    assert.equal((await res.json()).handled, "unresolved_customer");
    assert.equal(pool.state.subscriptions.length, 0);
  } finally {
    await server.close();
  }
});

test("charge.dispute.created deactivates the stripe entitlement", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  const server = await listenApp(buildApp({ pool, stripe }));
  try {
    const event = makeEvent("charge.dispute.created", { id: "dp_1", customer: CUSTOMER });
    const { payload, header } = signedWebhook(event, SECRET);
    const res = await postWebhook(server, payload, header);

    assert.equal(res.status, 200);
    const ent = pool.state.entitlements.find((e) => e.account_id === ACCOUNT && e.source === "stripe");
    assert.equal(ent.active, 0);
  } finally {
    await server.close();
  }
});
