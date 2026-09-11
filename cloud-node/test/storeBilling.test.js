const test = require("node:test");
const assert = require("node:assert/strict");
const {
  decodeAppleJwsPoke,
  sanitizeStoreExtra,
  verifyStorePurchase,
} = require("../lib/storeBilling");
const { createBillingMockPool } = require("./helpers/mockBillingPool");

function appleJws(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `e30.${body}.sig`;
}

test("decodeAppleJwsPoke reads originalTransactionId without trusting status", () => {
  const poke = decodeAppleJwsPoke(
    appleJws({ originalTransactionId: "orig-1", productId: "exo.pro.monthly", environment: "Sandbox" }),
  );
  assert.equal(poke.storeOriginalId, "orig-1");
  assert.equal(poke.environment, "sandbox");
});

test("sanitizeStoreExtra drops tokens and jws", () => {
  const extra = sanitizeStoreExtra({
    platform: "apple",
    status: "trialing",
    product_id: "exo.pro.monthly",
    expires_at: "2026-10-01T00:00:00.000Z",
    signed_jws: "secret",
    purchaseToken: "tok",
  });
  assert.deepEqual(extra, {
    platform: "apple",
    status: "trialing",
    product_id: "exo.pro.monthly",
    expires_at: "2026-10-01T00:00:00.000Z",
  });
  assert.equal("signed_jws" in extra, false);
});

test("verifyStorePurchase binds globally and rejects a second account", async () => {
  const pool = createBillingMockPool();
  const a = "110e8400-e29b-41d4-a716-446655440001";
  const b = "110e8400-e29b-41d4-a716-446655440002";
  pool.addAccount(a, "one@test.ch");
  pool.addAccount(b, "two@test.ch");
  const fetchStoreTruth = async () => ({
    storeOriginalId: "orig-shared",
    productId: "exo.pro.monthly",
    status: "trialing",
    environment: "production",
    expiresAt: "2026-10-11T00:00:00.000Z",
  });

  const first = await verifyStorePurchase(
    { pool, fetchStoreTruth, expectLivemode: false },
    a,
    { platform: "apple", signed_jws: appleJws({ originalTransactionId: "orig-shared" }) },
  );
  assert.equal(first.ok, true);
  assert.equal(first.store_checkout_required, false);
  const extra = JSON.parse(pool.state.entitlements.find((e) => e.source === "app_store").extra);
  assert.equal(extra.platform, "apple");
  assert.equal(extra.signed_jws, undefined);

  await assert.rejects(
    () =>
      verifyStorePurchase(
        { pool, fetchStoreTruth, expectLivemode: false },
        b,
        { platform: "apple", signed_jws: appleJws({ originalTransactionId: "orig-shared" }) },
      ),
    (err) => err.status === 409 && err.message === "store_owned_by_other_account",
  );
});

test("sandbox poke is rejected when live mode is expected", async () => {
  const pool = createBillingMockPool();
  pool.addAccount("110e8400-e29b-41d4-a716-446655440003", "live@test.ch");
  await assert.rejects(
    () =>
      verifyStorePurchase(
        { pool, fetchStoreTruth: async () => ({}), expectLivemode: true },
        "110e8400-e29b-41d4-a716-446655440003",
        {
          platform: "apple",
          signed_jws: appleJws({ originalTransactionId: "s", environment: "Sandbox" }),
        },
      ),
    (err) => err.status === 422 && err.message === "invalid_store_receipt",
  );
});
