process.env.JWT_SECRET = "store-webhook-test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { processAppleNotification, processPlayNotification } = require("../lib/storeWebhook");

const ACCOUNT = "440e8400-e29b-41d4-a716-446655440001";

function seedApple(pool) {
  pool.addAccount(ACCOUNT, "payer@test.ch");
  pool.state.storeSubscriptions.push({
    account_id: ACCOUNT,
    platform: "apple",
    store_original_id: "orig-hook",
    product_id: "exo.pro.monthly",
    status: "trialing",
    environment: "production",
    retired: 0,
  });
}

test("Apple notification re-fetches live status and entitles", async () => {
  const pool = createBillingMockPool();
  seedApple(pool);
  const result = await processAppleNotification(
    {
      pool,
      expectLivemode: false,
      verifyAppleSignedJws: async () => ({
        notificationUUID: "uuid-1",
        notificationType: "DID_RENEW",
        data: {
          environment: "Production",
          signedTransactionInfo: `e30.${Buffer.from(JSON.stringify({ originalTransactionId: "orig-hook" })).toString("base64url")}.sig`,
        },
      }),
      fetchStoreTruth: async () => ({
        storeOriginalId: "orig-hook",
        productId: "exo.pro.monthly",
        status: "active",
        environment: "production",
        expiresAt: "2026-12-01T00:00:00.000Z",
        autoRenew: true,
      }),
    },
    { signedPayload: "header.payload.sig" },
  );
  assert.equal(result.handled, "DID_RENEW");
  const ent = pool.state.entitlements.find((e) => e.source === "app_store");
  assert.equal(ent.active, 1);
  assert.equal(pool.state.storeSubscriptions[0].status, "active");
});

test("replayed Apple notification is a no-op", async () => {
  const pool = createBillingMockPool();
  seedApple(pool);
  const deps = {
    pool,
    expectLivemode: false,
    verifyAppleSignedJws: async () => ({
      notificationUUID: "uuid-dup",
      notificationType: "EXPIRED",
      data: {
        environment: "Production",
        signedTransactionInfo: `e30.${Buffer.from(JSON.stringify({ originalTransactionId: "orig-hook" })).toString("base64url")}.sig`,
      },
    }),
    fetchStoreTruth: async () => ({
      storeOriginalId: "orig-hook",
      productId: "exo.pro.monthly",
      status: "expired",
      environment: "production",
      expiresAt: null,
      autoRenew: false,
    }),
  };
  const first = await processAppleNotification(deps, { signedPayload: "x.y.z" });
  const second = await processAppleNotification(deps, { signedPayload: "x.y.z" });
  assert.equal(first.ok, true);
  assert.equal(second.deduped, true);
});

test("sandbox Apple notification is ignored in live mode", async () => {
  const pool = createBillingMockPool();
  seedApple(pool);
  const result = await processAppleNotification(
    {
      pool,
      expectLivemode: true,
      verifyAppleSignedJws: async () => ({
        notificationUUID: "uuid-sand",
        notificationType: "SUBSCRIBED",
        data: { environment: "Sandbox", signedTransactionInfo: "e30.e30.sig" },
      }),
    },
    { signedPayload: "x.y.z" },
  );
  assert.equal(result.ignored, "livemode_mismatch");
  assert.equal(pool.state.entitlements.length, 0);
});

test("provider outage does not record the event so the store can retry", async () => {
  const pool = createBillingMockPool();
  seedApple(pool);
  await assert.rejects(
    () =>
      processAppleNotification(
        {
          pool,
          expectLivemode: false,
          verifyAppleSignedJws: async () => ({
            notificationUUID: "uuid-out",
            notificationType: "DID_RENEW",
            data: {
              environment: "Production",
              signedTransactionInfo: `e30.${Buffer.from(JSON.stringify({ originalTransactionId: "orig-hook" })).toString("base64url")}.sig`,
            },
          }),
          fetchStoreTruth: async () => {
            throw new Error("apple down");
          },
        },
        { signedPayload: "x.y.z" },
      ),
    (err) => err.status === 502,
  );
  assert.equal(pool.state.storeEvents["uuid-out"], undefined);
});

test("Play RTDN refund deactivates the entitlement", async () => {
  const pool = createBillingMockPool();
  pool.addAccount(ACCOUNT, "payer@test.ch");
  pool.state.storeSubscriptions.push({
    account_id: ACCOUNT,
    platform: "play",
    store_original_id: "orig-play",
    product_id: "exo.pro.monthly",
    status: "active",
    environment: "production",
    retired: 0,
  });
  pool.state.entitlements.push({
    account_id: ACCOUNT,
    feature: "sort",
    source: "play",
    active: 1,
    extra: "{}",
  });
  const data = Buffer.from(
    JSON.stringify({
      packageName: "ch.exosites.exosites_mobile",
      subscriptionNotification: { notificationType: 12, purchaseToken: "orig-play", subscriptionId: "exo.pro.monthly" },
    }),
  ).toString("base64");
  const result = await processPlayNotification(
    {
      pool,
      skipPlayAuth: true,
      expectLivemode: false,
      fetchStoreTruth: async () => ({
        storeOriginalId: "orig-play",
        productId: "exo.pro.monthly",
        status: "expired",
        environment: "production",
        expiresAt: null,
        autoRenew: false,
      }),
    },
    { message: { messageId: "m-1", data } },
    "Bearer test",
  );
  assert.equal(result.handled, "rtdn");
  assert.equal(pool.state.entitlements.find((e) => e.source === "play").active, 0);
});
