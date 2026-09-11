/**
 * Normalized App Store / Play statuses shared by verify, webhooks, and reconcile.
 * Desktop cache only treats active | trialing | past_due as entitled.
 */

const ENTITLED_STORE_STATUSES = Object.freeze(["active", "trialing", "past_due"]);
const ENTITLED_SET = new Set(ENTITLED_STORE_STATUSES);
const SCAN_STORE_STATUSES = Object.freeze([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
]);

function isStoreEntitled(status, expiresAt, nowMs = Date.now()) {
  const normalized = String(status || "");
  if (ENTITLED_SET.has(normalized)) return true;
  if (normalized === "canceled" && expiresAt) {
    return new Date(expiresAt).getTime() > nowMs;
  }
  return false;
}

/**
 * Auto-renew off but still in the paid window looks like Stripe cancel-at-period-end.
 * @param {string} status
 * @param {string | Date | null | undefined} expiresAt
 */
function displayStoreStatus(status, expiresAt, nowMs = Date.now()) {
  const entitled = isStoreEntitled(status, expiresAt, nowMs);
  if (status === "canceled" && entitled) {
    return { status: "active", cancelAtPeriodEnd: true, entitled: true };
  }
  return {
    status: String(status || "expired"),
    cancelAtPeriodEnd: status === "canceled",
    entitled,
  };
}

/** Apple App Store Server API lastTransactions[].status */
function mapAppleNumericStatus(numericStatus, offerType) {
  const num = Number(numericStatus);
  if (num === 1) return Number(offerType) === 1 ? "trialing" : "active";
  if (num === 3 || num === 4) return "past_due";
  return "expired";
}

/** Play Developer API subscriptionsv2 subscriptionState */
function mapPlaySubscriptionState(state, inTrial) {
  const value = String(state || "");
  if (value === "SUBSCRIPTION_STATE_ACTIVE") return inTrial ? "trialing" : "active";
  if (value === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" || value === "SUBSCRIPTION_STATE_ON_HOLD") {
    return "past_due";
  }
  if (value === "SUBSCRIPTION_STATE_CANCELED") return "canceled";
  return "expired";
}

module.exports = {
  ENTITLED_STORE_STATUSES,
  SCAN_STORE_STATUSES,
  isStoreEntitled,
  displayStoreStatus,
  mapAppleNumericStatus,
  mapPlaySubscriptionState,
};
