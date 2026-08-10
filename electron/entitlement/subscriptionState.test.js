const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  syncCloudSubscription,
  getSubscriptionStatus,
  subscriptionPath,
  OFFLINE_TRUST_DAYS,
} = require("./subscriptionState");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "exo-sub-test-"));
}

const PRO_PROFILE = {
  plan: "pro",
  subscription_active: true,
  subscription_status: "active",
  subscription_current_period_end: "2027-01-01T00:00:00.000Z",
  subscription_cancel_at_period_end: false,
};

test("syncCloudSubscription persists snake_case profile as camelCase cache", () => {
  const dir = tmpDir();
  syncCloudSubscription(dir, PRO_PROFILE);

  const raw = JSON.parse(fs.readFileSync(subscriptionPath(dir), "utf8"));
  assert.equal(raw.subscriptionActive, true);
  assert.equal(raw.subscriptionStatus, "active");
  assert.equal(raw.plan, "pro");
  assert.ok(raw.lastSyncedAt > 0);
});

test("fresh active cache is entitled", () => {
  const dir = tmpDir();
  syncCloudSubscription(dir, PRO_PROFILE);

  const status = getSubscriptionStatus(dir);
  assert.equal(status.subscriptionEntitled, true);
  assert.equal(status.subscriptionPlan, "pro");
});

test("past_due keeps access while Stripe retries", () => {
  const dir = tmpDir();
  syncCloudSubscription(dir, {
    ...PRO_PROFILE,
    plan: "past_due",
    subscription_status: "past_due",
  });
  assert.equal(getSubscriptionStatus(dir).subscriptionEntitled, true);
});

test("canceled subscription is not entitled", () => {
  const dir = tmpDir();
  syncCloudSubscription(dir, {
    ...PRO_PROFILE,
    plan: "canceled",
    subscription_active: false,
    subscription_status: "canceled",
  });
  const status = getSubscriptionStatus(dir);
  assert.equal(status.subscriptionEntitled, false);
  assert.equal(status.subscriptionStatus, "canceled");
});

test("cache older than the offline trust window loses access", () => {
  const dir = tmpDir();
  syncCloudSubscription(dir, PRO_PROFILE);

  const beyondTrust = Date.now() + (OFFLINE_TRUST_DAYS * 24 + 1) * 60 * 60 * 1000;
  assert.equal(getSubscriptionStatus(dir, beyondTrust).subscriptionEntitled, false);
});

test("missing and corrupt cache files default to not entitled", () => {
  const empty = tmpDir();
  assert.equal(getSubscriptionStatus(empty).subscriptionEntitled, false);

  const corrupt = tmpDir();
  fs.writeFileSync(subscriptionPath(corrupt), "{not json", "utf8");
  assert.equal(getSubscriptionStatus(corrupt).subscriptionEntitled, false);
});
