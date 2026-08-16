const test = require("node:test");
const assert = require("node:assert/strict");
const { accountHasSortAccess } = require("../lib/sortAccess");

test("accountHasSortAccess allows active trial", () => {
  assert.equal(accountHasSortAccess({ trial_active: true, entitlements: [] }), true);
});

test("accountHasSortAccess allows active sort entitlement", () => {
  assert.equal(
    accountHasSortAccess({
      trial_active: false,
      entitlements: [{ feature: "sort", active: true }],
    }),
    true,
  );
});

test("accountHasSortAccess denies expired trial without entitlement", () => {
  assert.equal(
    accountHasSortAccess({
      trial_active: false,
      entitlements: [{ feature: "sort", active: false }],
    }),
    false,
  );
});

// Regression: the `free_trial` entitlement row is written once at signup
// (active=1) and never revisited when the trial ends, so it goes stale.
// `trial_active` is the only trustworthy signal for trial validity.
test("accountHasSortAccess denies stale active free_trial entitlement once trial_active is false", () => {
  assert.equal(
    accountHasSortAccess({
      trial_active: false,
      entitlements: [{ feature: "sort", source: "free_trial", active: true }],
    }),
    false,
  );
});

test("accountHasSortAccess allows offline_license entitlement after trial ends", () => {
  assert.equal(
    accountHasSortAccess({
      trial_active: false,
      entitlements: [{ feature: "sort", source: "offline_license", active: true }],
    }),
    true,
  );
});

test("accountHasSortAccess allows active stripe entitlement after trial ends", () => {
  assert.equal(
    accountHasSortAccess({
      trial_active: false,
      entitlements: [
        { feature: "sort", source: "free_trial", active: true },
        { feature: "sort", source: "stripe", active: true },
      ],
    }),
    true,
  );
});

test("accountHasSortAccess denies canceled stripe entitlement even with stale free_trial row", () => {
  assert.equal(
    accountHasSortAccess({
      trial_active: false,
      entitlements: [
        { feature: "sort", source: "free_trial", active: true },
        { feature: "sort", source: "stripe", active: false },
      ],
    }),
    false,
  );
});
