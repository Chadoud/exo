const test = require("node:test");
const assert = require("node:assert/strict");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { retireStoreSubscriptionsForDeletion } = require("../lib/storeDeletion");

test("account deletion retires the store bind and cancels Play", async () => {
  const pool = createBillingMockPool();
  const account = "660e8400-e29b-41d4-a716-446655440001";
  pool.addAccount(account, "gone@test.ch");
  pool.state.storeSubscriptions.push({
    account_id: account,
    platform: "play",
    store_original_id: "play-token",
    product_id: "exo.pro.monthly",
    status: "active",
    environment: "production",
    retired: 0,
  });
  pool.state.entitlements.push({
    account_id: account,
    feature: "sort",
    source: "play",
    active: 1,
    extra: "{}",
  });
  let canceled = 0;
  await retireStoreSubscriptionsForDeletion(account, {
    pool,
    cancelPlay: async () => {
      canceled += 1;
      return { ok: true };
    },
  });
  assert.equal(canceled, 1);
  assert.equal(pool.state.storeSubscriptions[0].retired, 1);
  assert.equal(pool.state.storeSubscriptions[0].account_id, null);
  assert.equal(pool.state.entitlements[0].active, 0);
});

test("retired store identity cannot be bound to a new account", async () => {
  const { verifyStorePurchase } = require("../lib/storeBilling");
  const pool = createBillingMockPool();
  const next = "660e8400-e29b-41d4-a716-446655440002";
  pool.addAccount(next, "new@test.ch");
  pool.state.storeSubscriptions.push({
    account_id: null,
    platform: "apple",
    store_original_id: "retired-orig",
    product_id: "exo.pro.monthly",
    status: "canceled",
    environment: "production",
    retired: 1,
  });
  await assert.rejects(
    () =>
      verifyStorePurchase(
        {
          pool,
          expectLivemode: false,
          fetchStoreTruth: async () => ({
            storeOriginalId: "retired-orig",
            productId: "exo.pro.monthly",
            status: "active",
            environment: "production",
            expiresAt: "2026-12-01T00:00:00.000Z",
          }),
        },
        next,
        {
          platform: "apple",
          signed_jws: `e30.${Buffer.from(JSON.stringify({ originalTransactionId: "retired-orig" })).toString("base64url")}.sig`,
        },
      ),
    (err) => err.status === 409 && err.message === "store_owned_by_other_account",
  );
});
