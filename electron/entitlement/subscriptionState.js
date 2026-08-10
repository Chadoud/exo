/**
 * Local cache of the cloud Stripe subscription state (subscription.json).
 *
 * Mirrors trialState.js: Electron syncs the /v1/me profile into a small JSON
 * file that both this process and the Python backend read. The cache is
 * trusted offline for a bounded window so a paying user is never locked out
 * by a flaky connection — and a canceled one cannot stay entitled forever by
 * going offline.
 */

const fs = require("fs");
const path = require("path");

const OFFLINE_TRUST_DAYS = 7;
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

function subscriptionPath(userData) {
  return path.join(userData, "subscription.json");
}

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Persist the subscription slice of a cloud /v1/me profile (snake_case in,
 * camelCase out — same convention as trial sync).
 * @param {string} userData profile data root
 * @param {object | null} profile cloud profile from /v1/me
 */
function syncCloudSubscription(userData, profile) {
  if (!profile || typeof profile !== "object") return null;
  const record = {
    subscriptionActive: Boolean(profile.subscription_active),
    subscriptionStatus:
      typeof profile.subscription_status === "string" ? profile.subscription_status : null,
    subscriptionCurrentPeriodEnd: profile.subscription_current_period_end
      ? String(profile.subscription_current_period_end)
      : null,
    subscriptionCancelAtPeriodEnd: Boolean(profile.subscription_cancel_at_period_end),
    plan: typeof profile.plan === "string" ? profile.plan : null,
    lastSyncedAt: Date.now() / 1000,
  };
  const p = subscriptionPath(userData);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ v: 1, ...record }, null, 2), "utf8");
  return record;
}

/**
 * Subscription fields for entitlement state (camelCase, safe defaults).
 * `subscriptionEntitled` folds in the offline trust window.
 * @param {string} userData profile data root
 * @param {number} [nowMs] injectable clock for tests
 */
function getSubscriptionStatus(userData, nowMs = Date.now()) {
  const record = readJsonSafe(subscriptionPath(userData), null);
  if (!record || typeof record !== "object") {
    return {
      subscriptionActive: false,
      subscriptionStatus: null,
      subscriptionCurrentPeriodEnd: null,
      subscriptionCancelAtPeriodEnd: false,
      subscriptionPlan: null,
      subscriptionEntitled: false,
    };
  }
  const status = typeof record.subscriptionStatus === "string" ? record.subscriptionStatus : null;
  const active = Boolean(record.subscriptionActive) && ENTITLED_STATUSES.has(String(status));
  const lastSyncedMs = Number(record.lastSyncedAt || 0) * 1000;
  const withinTrust =
    lastSyncedMs > 0 && nowMs - lastSyncedMs <= OFFLINE_TRUST_DAYS * 24 * 60 * 60 * 1000;
  return {
    subscriptionActive: Boolean(record.subscriptionActive),
    subscriptionStatus: status,
    subscriptionCurrentPeriodEnd: record.subscriptionCurrentPeriodEnd || null,
    subscriptionCancelAtPeriodEnd: Boolean(record.subscriptionCancelAtPeriodEnd),
    subscriptionPlan: typeof record.plan === "string" ? record.plan : null,
    subscriptionEntitled: active && withinTrust,
  };
}

module.exports = {
  subscriptionPath,
  syncCloudSubscription,
  getSubscriptionStatus,
  OFFLINE_TRUST_DAYS,
};
