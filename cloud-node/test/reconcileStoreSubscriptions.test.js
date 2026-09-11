const test = require("node:test");
const assert = require("node:assert/strict");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { reconcileStoreSubscriptions } = require("../lib/reconcileStoreSubscriptions");

const ACCOUNT = "550e8400-e29b-41d4-a716-446655440001";

test("store reconcile repairs missed notification drift", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch");
  pool.state.storeSubscriptions.push({
    account_id: ACCOUNT,
    platform: "apple",
    store_original_id: "orig-drift",
    product_id: "exo.pro.monthly",
    status: "active",
    environment: "production",
    retired: 0,
  });
  const result = await reconcileStoreSubscriptions({
    pool,
    fetchApple: async () => ({
      storeOriginalId: "orig-drift",
      productId: "exo.pro.monthly",
      status: "expired",
      environment: "production",
      expiresAt: null,
      autoRenew: false,
    }),
  });
  assert.equal(result.drifted, 1);
  assert.equal(result.fixed, 1);
  assert.equal(pool.state.storeSubscriptions[0].status, "expired");
  assert.equal(pool.state.entitlements.find((e) => e.source === "app_store").active, 0);
});

test("store reconcile dry-run reports drift without writing", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "user@test.ch");
  pool.state.storeSubscriptions.push({
    account_id: ACCOUNT,
    platform: "play",
    store_original_id: "orig-dry",
    product_id: "exo.pro.monthly",
    status: "active",
    environment: "production",
    retired: 0,
  });
  const result = await reconcileStoreSubscriptions(
    {
      pool,
      fetchPlay: async () => ({
        storeOriginalId: "orig-dry",
        productId: "exo.pro.monthly",
        status: "canceled",
        environment: "production",
        expiresAt: null,
        autoRenew: false,
      }),
    },
    { dryRun: true },
  );
  assert.equal(result.drifted, 1);
  assert.equal(result.fixed, 0);
  assert.equal(pool.state.storeSubscriptions[0].status, "active");
});
