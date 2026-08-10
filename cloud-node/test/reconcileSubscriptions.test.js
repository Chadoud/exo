const test = require("node:test");
const assert = require("node:assert/strict");

const { reconcileSubscriptions } = require("../lib/reconcileSubscriptions");
const { applySubscriptionState } = require("../lib/stripeBilling");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { createMockStripe } = require("./helpers/mockStripe");

const ACCOUNT = "acc_1";
const CUSTOMER = "cus_1";

function stripeSub(id, status) {
  return {
    id,
    status,
    items: { data: [{ price: { id: "price_monthly_test" }, current_period_end: 1_900_000_000 }] },
    cancel_at_period_end: false,
  };
}

/** Seed a local subscription row via the canonical write path. */
async function seedLocalSubscription(pool, sub, eventCreated = 100) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  await applySubscriptionState(conn, ACCOUNT, sub, eventCreated);
  await conn.commit();
}

test("reconcile fixes drift: local active, Stripe canceled", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  await seedLocalSubscription(pool, stripeSub("sub_drift", "active"));
  stripe._setSubscription(stripeSub("sub_drift", "canceled"));

  const result = await reconcileSubscriptions({ pool, stripe });

  assert.deepEqual(result, { checked: 1, drifted: 1, fixed: 1 });
  assert.equal(pool.state.subscriptions[0].status, "canceled");
  const ent = pool.state.entitlements.find((e) => e.account_id === ACCOUNT && e.source === "stripe");
  assert.equal(ent.active, 0);
});

test("reconcile treats a subscription Stripe no longer returns as canceled", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe(); // retrieve() will 404
  await seedLocalSubscription(pool, stripeSub("sub_gone", "active"));

  const result = await reconcileSubscriptions({ pool, stripe });

  assert.equal(result.fixed, 1);
  assert.equal(pool.state.subscriptions[0].status, "canceled");
});

test("dry-run reports drift without writing", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  await seedLocalSubscription(pool, stripeSub("sub_dry", "active"));
  stripe._setSubscription(stripeSub("sub_dry", "canceled"));

  const result = await reconcileSubscriptions({ pool, stripe }, { dryRun: true });

  assert.deepEqual(result, { checked: 1, drifted: 1, fixed: 0 });
  assert.equal(pool.state.subscriptions[0].status, "active");
});

test("no drift is a no-op", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch", CUSTOMER);
  const stripe = createMockStripe();
  await seedLocalSubscription(pool, stripeSub("sub_ok", "active"));
  stripe._setSubscription(stripeSub("sub_ok", "active"));

  const result = await reconcileSubscriptions({ pool, stripe });

  assert.deepEqual(result, { checked: 1, drifted: 0, fixed: 0 });
  assert.equal(pool.state.subscriptions[0].status, "active");
});
