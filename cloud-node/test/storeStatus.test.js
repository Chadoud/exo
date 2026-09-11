const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isStoreEntitled,
  displayStoreStatus,
  mapAppleNumericStatus,
  mapPlaySubscriptionState,
} = require("../lib/storeStatus");

test("store status maps trial, grace, revoke, and expire", () => {
  assert.equal(mapAppleNumericStatus(1, 1), "trialing");
  assert.equal(mapAppleNumericStatus(1, 0), "active");
  assert.equal(mapAppleNumericStatus(3, 0), "past_due");
  assert.equal(mapAppleNumericStatus(4, 0), "past_due");
  assert.equal(mapAppleNumericStatus(5, 0), "expired");
  assert.equal(mapAppleNumericStatus(2, 0), "expired");
  assert.equal(mapPlaySubscriptionState("SUBSCRIPTION_STATE_ACTIVE", true), "trialing");
  assert.equal(mapPlaySubscriptionState("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", false), "past_due");
  assert.equal(mapPlaySubscriptionState("SUBSCRIPTION_STATE_CANCELED", false), "canceled");
  assert.equal(mapPlaySubscriptionState("SUBSCRIPTION_STATE_EXPIRED", false), "expired");
  assert.equal(mapPlaySubscriptionState("SUBSCRIPTION_STATE_REVOKED", false), "expired");
});

test("canceled-in-period stays entitled and displays as cancel-at-period-end", () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  assert.equal(isStoreEntitled("canceled", future), true);
  assert.deepEqual(displayStoreStatus("canceled", future), {
    status: "active",
    cancelAtPeriodEnd: true,
    entitled: true,
  });
  assert.equal(isStoreEntitled("expired", future), false);
  assert.equal(isStoreEntitled("active", null), true);
});
