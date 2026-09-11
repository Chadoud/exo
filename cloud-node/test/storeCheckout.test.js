const test = require("node:test");
const assert = require("node:assert/strict");
const { computeStoreCheckoutRequired, subscriptionSourceFrom } = require("../lib/storeCheckout");

test("store checkout is off when billing is disabled", () => {
  assert.equal(computeStoreCheckoutRequired({ enabled: false, entitlements: [] }), false);
});

test("cloud trial and free_trial do not skip the phone pair gate", () => {
  assert.equal(
    computeStoreCheckoutRequired({
      enabled: true,
      entitlements: [{ feature: "sort", source: "free_trial", active: true }],
    }),
    true,
  );
});

test("stripe, store, and license skip the pair gate", () => {
  for (const source of ["stripe", "app_store", "play", "offline_license"]) {
    assert.equal(
      computeStoreCheckoutRequired({
        enabled: true,
        entitlements: [{ feature: "sort", source, active: true }],
      }),
      false,
      source,
    );
  }
  assert.equal(computeStoreCheckoutRequired({ enabled: true, stripeEntitled: true, entitlements: [] }), false);
});

test("exempt accounts skip the pair gate", () => {
  assert.equal(computeStoreCheckoutRequired({ enabled: true, exempt: true, entitlements: [] }), false);
});

test("subscriptionSourceFrom prefers store over stripe", () => {
  assert.equal(
    subscriptionSourceFrom(
      [
        { feature: "sort", source: "stripe", active: true },
        { feature: "sort", source: "app_store", active: true },
      ],
      true,
    ),
    "app_store",
  );
  assert.equal(subscriptionSourceFrom([], true), "stripe");
  assert.equal(subscriptionSourceFrom([], false), null);
});
