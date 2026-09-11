const test = require("node:test");
const assert = require("node:assert/strict");
const { managementFromSource, overlayStoreBilling, playManageUrl, APPLE_MANAGE_URL } = require("../lib/storeManage");

test("management destination never sends store users to Stripe", () => {
  assert.deepEqual(managementFromSource("app_store", []), {
    destination: "app_store",
    url: APPLE_MANAGE_URL,
  });
  const play = managementFromSource("play", [
    { source: "play", active: true, extra: { product_id: "exo.pro.monthly" } },
  ]);
  assert.equal(play.destination, "play");
  assert.equal(play.url, playManageUrl("exo.pro.monthly"));
  assert.deepEqual(managementFromSource("stripe", []), { destination: "stripe", url: null });
});

test("overlayStoreBilling promotes a live store row onto /v1/me", () => {
  const billing = overlayStoreBilling({
    stripeSub: null,
    stripeEntitled: false,
    entitlements: [{ feature: "sort", source: "app_store", active: true, extra: { product_id: "exo.pro.monthly" } }],
    storeRow: {
      platform: "apple",
      status: "trialing",
      current_period_end: "2026-10-11T00:00:00.000Z",
      auto_renew: 1,
      retired: 0,
    },
  });
  assert.equal(billing.subscription_active, true);
  assert.equal(billing.subscription_source, "app_store");
  assert.equal(billing.subscription_management.destination, "app_store");
  assert.equal(billing.store_subscription_survives_deletion, true);
  assert.equal(billing.subscription_current_period_end, "2026-10-11T00:00:00.000Z");
});

test("overlayStoreBilling prefers store status over a stale Stripe canceled row", () => {
  const billing = overlayStoreBilling({
    stripeSub: { status: "canceled", current_period_end: "2025-01-01T00:00:00.000Z", cancel_at_period_end: false },
    stripeEntitled: false,
    entitlements: [{ feature: "sort", source: "play", active: true, extra: { product_id: "exo.pro.monthly" } }],
    storeRow: {
      platform: "play",
      status: "active",
      current_period_end: "2026-12-01T00:00:00.000Z",
      auto_renew: 1,
      retired: 0,
    },
  });
  assert.equal(billing.subscription_source, "play");
  assert.equal(billing.subscription_status, "active");
  assert.equal(billing.subscription_active, true);
  assert.equal(billing.subscription_current_period_end, "2026-12-01T00:00:00.000Z");
});
