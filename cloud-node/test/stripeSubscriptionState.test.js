const test = require("node:test");
const assert = require("node:assert/strict");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { createMockStripe } = require("./helpers/mockStripe");
const {
  applySubscriptionState,
  latestSubscriptionRow,
  resolveDuplicateSubscriptions,
  cancelSubscriptionsForAccountDeletion,
  isEntitledSubscriptionRow,
} = require("../lib/stripeBilling");
const { computePlan } = require("../lib/accounts");

const ACCOUNT = "770e8400-e29b-41d4-a716-446655440002";

// Modern payload shape (Stripe API >= 2025-03-31): current_period_end lives on
// the subscription item, not the subscription.
function stripeSub(id, status, overrides = {}) {
  return {
    id,
    status,
    items: {
      data: [{ price: { id: "price_monthly_test" }, current_period_end: 1_900_000_000 }],
    },
    cancel_at_period_end: false,
    ...overrides,
  };
}

function stripeEntitlement(pool) {
  return pool.state.entitlements.find(
    (e) => e.account_id === ACCOUNT && e.feature === "sort" && e.source === "stripe",
  );
}

test("active subscription writes an active stripe entitlement", async () => {
  const pool = createBillingMockPool();
  const conn = await pool.getConnection();
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_1", "active"), 100);

  const row = await latestSubscriptionRow(pool, ACCOUNT);
  assert.equal(row.status, "active");
  assert.equal(isEntitledSubscriptionRow(row), true);
  assert.equal(stripeEntitlement(pool).active, 1);
  // period end read from the item-level field (modern API shape)
  assert.equal(row.current_period_end?.getTime(), 1_900_000_000 * 1000);
});

test("legacy top-level current_period_end (pre-2025 API) still parses", async () => {
  const pool = createBillingMockPool();
  const conn = await pool.getConnection();
  const legacy = {
    id: "sub_legacy",
    status: "active",
    items: { data: [{ price: { id: "price_monthly_test" } }] },
    current_period_end: 1_900_000_000,
    cancel_at_period_end: false,
  };
  await applySubscriptionState(conn, ACCOUNT, legacy, 100);
  const row = await latestSubscriptionRow(pool, ACCOUNT);
  assert.equal(row.current_period_end?.getTime(), 1_900_000_000 * 1000);
});

test("past_due keeps entitlement active (Stripe Smart Retries grace)", async () => {
  const pool = createBillingMockPool();
  const conn = await pool.getConnection();
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_1", "past_due"), 100);
  assert.equal(stripeEntitlement(pool).active, 1);
});

test("canceled subscription deactivates the entitlement", async () => {
  const pool = createBillingMockPool();
  const conn = await pool.getConnection();
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_1", "active"), 100);
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_1", "canceled"), 200);
  assert.equal(stripeEntitlement(pool).active, 0);
  assert.equal((await latestSubscriptionRow(pool, ACCOUNT)).status, "canceled");
});

test("out-of-order event cannot regress newer state", async () => {
  const pool = createBillingMockPool();
  const conn = await pool.getConnection();
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_1", "canceled"), 200);
  // Older event (created=100) arrives late claiming the subscription is active.
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_1", "active"), 100);

  assert.equal((await latestSubscriptionRow(pool, ACCOUNT)).status, "canceled");
  assert.equal(stripeEntitlement(pool).active, 0);
});

test("resubscribe after cancel picks the new live subscription", async () => {
  const pool = createBillingMockPool();
  const conn = await pool.getConnection();
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_old", "canceled"), 100);
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_new", "active"), 200);

  const row = await latestSubscriptionRow(pool, ACCOUNT);
  assert.equal(row.stripe_subscription_id, "sub_new");
  assert.equal(stripeEntitlement(pool).active, 1);
});

test("duplicate live subscriptions: newest is canceled at Stripe", async () => {
  const pool = createBillingMockPool();
  const stripe = createMockStripe();
  const conn = await pool.getConnection();
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_first", "active"), 100);
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_second", "active"), 200);
  stripe._setSubscription(stripeSub("sub_second", "active"));

  await resolveDuplicateSubscriptions(conn, stripe, ACCOUNT, 300);

  assert.deepEqual(stripe._calls.canceled, ["sub_second"]);
  const rows = pool.state.subscriptions;
  assert.equal(rows.find((s) => s.stripe_subscription_id === "sub_first").status, "active");
  assert.equal(rows.find((s) => s.stripe_subscription_id === "sub_second").status, "canceled");
});

test("account deletion cancels live subscriptions at Stripe", async () => {
  const pool = createBillingMockPool();
  const stripe = createMockStripe();
  const conn = await pool.getConnection();
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_live", "active"), 100);
  await applySubscriptionState(conn, ACCOUNT, stripeSub("sub_gone", "canceled"), 100);

  await cancelSubscriptionsForAccountDeletion(ACCOUNT, { pool, stripe });

  assert.deepEqual(stripe._calls.canceled, ["sub_live"]);
});

test("computePlan maps subscription + trial state to the five plan values", () => {
  assert.equal(computePlan({ status: "active" }, false), "pro");
  assert.equal(computePlan({ status: "trialing" }, false), "pro");
  assert.equal(computePlan({ status: "past_due" }, true), "past_due");
  assert.equal(computePlan(null, true), "trial");
  assert.equal(computePlan({ status: "canceled" }, false), "canceled");
  assert.equal(computePlan(null, false), "expired");
});
