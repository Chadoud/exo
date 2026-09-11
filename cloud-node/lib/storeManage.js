/**
 * Store management URLs and profile overlay. No tokens in the account payload.
 */

const config = require("./config");
const { subscriptionSourceFrom } = require("./storeCheckout");
const { displayStoreStatus } = require("./storeStatus");

const APPLE_MANAGE_URL = "https://apps.apple.com/account/subscriptions";
const PLAY_MANAGE_BASE = "https://play.google.com/store/account/subscriptions";

function playManageUrl(productId, packageName) {
  const pkg = packageName || config.store.play.packageName;
  if (productId) {
    return `${PLAY_MANAGE_BASE}?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(pkg)}`;
  }
  return PLAY_MANAGE_BASE;
}

/**
 * @param {"stripe"|"app_store"|"play"|"offline_license"|null} source
 * @param {Array<{ source?: string, active?: boolean, extra?: object }>} entitlements
 */
function managementFromSource(source, entitlements) {
  if (source === "app_store") {
    return { destination: "app_store", url: APPLE_MANAGE_URL };
  }
  if (source === "play") {
    const extra = (entitlements || []).find((e) => e.source === "play" && e.active)?.extra;
    return { destination: "play", url: playManageUrl(extra?.product_id) };
  }
  if (source === "stripe") {
    return { destination: "stripe", url: null };
  }
  return { destination: null, url: null };
}

/**
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} accountId
 */
async function loadStoreSubscriptionSummary(pool, accountId) {
  try {
    const [rows] = await pool.execute(
      `SELECT platform, product_id, status, current_period_end, auto_renew, retired
       FROM store_subscriptions
       WHERE account_id = ? AND retired = 0
       ORDER BY updated_at DESC LIMIT 1`,
      [accountId],
    );
    return rows[0] || null;
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR") return null;
    throw e;
  }
}

function storeRowEntitled(row) {
  if (!row || Number(row.retired) === 1) return false;
  const expires = row.current_period_end;
  return displayStoreStatus(row.status, expires).entitled;
}

/**
 * Merge Stripe + store into the /v1/me billing slice.
 * @param {{ stripeSub?: object | null, stripeEntitled: boolean, entitlements: Array<object>, storeRow?: object | null }} input
 */
function overlayStoreBilling(input) {
  const source = subscriptionSourceFrom(input.entitlements, input.stripeEntitled);
  const storeEntitled = storeRowEntitled(input.storeRow) ||
    (input.entitlements || []).some(
      (e) => e.feature === "sort" && e.active && (e.source === "app_store" || e.source === "play"),
    );
  const display = input.storeRow
    ? displayStoreStatus(input.storeRow.status, input.storeRow.current_period_end)
    : null;
  const preferStore = storeEntitled && !input.stripeEntitled;
  const periodEnd = preferStore
    ? input.storeRow?.current_period_end || null
    : input.stripeSub?.current_period_end || input.storeRow?.current_period_end || null;
  const cancelAtEnd = input.stripeEntitled
    ? Boolean(input.stripeSub?.cancel_at_period_end)
    : Boolean(display?.cancelAtPeriodEnd || (input.storeRow && !input.storeRow.auto_renew));
  return {
    subscription_active: Boolean(input.stripeEntitled || storeEntitled),
    subscription_status: preferStore
      ? display?.status || null
      : input.stripeSub?.status || display?.status || null,
    subscription_current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
    subscription_cancel_at_period_end: cancelAtEnd,
    subscription_source: source,
    subscription_management: managementFromSource(source, input.entitlements),
    store_subscription_survives_deletion: source === "app_store" || source === "play",
    store_entitled: storeEntitled,
  };
}

function exportStoreSubscriptionMeta(row) {
  if (!row) return null;
  return {
    platform: row.platform,
    product_id: row.product_id,
    status: row.status,
    current_period_end: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    auto_renew: Boolean(row.auto_renew),
  };
}

module.exports = {
  APPLE_MANAGE_URL,
  playManageUrl,
  managementFromSource,
  loadStoreSubscriptionSummary,
  overlayStoreBilling,
  exportStoreSubscriptionMeta,
};
