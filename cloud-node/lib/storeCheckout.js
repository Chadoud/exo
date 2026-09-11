/**
 * Phone pair-gate: who must start a Store trial before redeem/register.
 * Cloud trial / free_trial never clears this. Stripe, App Store, Play, and
 * offline license do. STORE_BILLING_ENABLED=0 ⇒ never required.
 */

const { getPool } = require("./db");

const PAID_SORT_SOURCES = Object.freeze(["stripe", "app_store", "play", "offline_license"]);
const SOURCE_PRIORITY = Object.freeze(["app_store", "play", "stripe", "offline_license"]);

function storeBillingEnabled() {
  return process.env.STORE_BILLING_ENABLED === "1";
}

/**
 * @param {{ enabled?: boolean; exempt?: boolean; entitlements?: Array<{ feature?: string; source?: string; active?: boolean }>; stripeEntitled?: boolean }} input
 */
function computeStoreCheckoutRequired(input) {
  const enabled = input.enabled !== undefined ? input.enabled : storeBillingEnabled();
  if (!enabled) return false;
  if (input.exempt) return false;
  if (input.stripeEntitled) return false;
  const ents = Array.isArray(input.entitlements) ? input.entitlements : [];
  const paid = ents.some(
    (e) => e?.feature === "sort" && e?.active && PAID_SORT_SOURCES.includes(String(e.source || "")),
  );
  return !paid;
}

/**
 * @param {Array<{ feature?: string; source?: string; active?: boolean }>} entitlements
 * @param {boolean} stripeEntitled
 * @returns {"stripe"|"app_store"|"play"|"offline_license"|null}
 */
function subscriptionSourceFrom(entitlements, stripeEntitled) {
  const ents = Array.isArray(entitlements) ? entitlements : [];
  for (const source of SOURCE_PRIORITY) {
    if (ents.some((e) => e?.feature === "sort" && e?.active && e?.source === source)) {
      return source;
    }
  }
  if (stripeEntitled) return "stripe";
  return null;
}

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} db
 * @param {string} accountId
 */
async function hasActiveStoreEntitlement(db, accountId) {
  try {
    const [rows] = await db.execute(
      `SELECT 1 FROM entitlements
       WHERE account_id = ? AND feature = 'sort' AND active = 1 AND source IN ('app_store', 'play')
       LIMIT 1`,
      [accountId],
    );
    return rows.length > 0;
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR") return false;
    throw e;
  }
}

/**
 * Lightweight pair-gate lookup. Never trusts a client body or User-Agent.
 * Pre-migration missing columns ⇒ not required (flag stays off until 030).
 * @param {string} accountId from JWT
 */
async function storeCheckoutRequiredForAccount(accountId) {
  if (!storeBillingEnabled()) return false;
  const pool = getPool();
  try {
    const [accounts] = await pool.execute(
      "SELECT store_billing_exempt FROM accounts WHERE id = ? AND is_active = 1 LIMIT 1",
      [accountId],
    );
    if (!accounts.length) return false;
    if (Number(accounts[0].store_billing_exempt) === 1) return false;
    let stripeEntitled = false;
    try {
      const [subs] = await pool.execute(
        `SELECT 1 FROM subscriptions
         WHERE account_id = ? AND status IN ('active', 'trialing', 'past_due')
         LIMIT 1`,
        [accountId],
      );
      stripeEntitled = subs.length > 0;
    } catch (e) {
      if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
    }
    const [ents] = await pool.execute(
      "SELECT feature, source, active FROM entitlements WHERE account_id = ?",
      [accountId],
    );
    return computeStoreCheckoutRequired({
      enabled: true,
      exempt: false,
      stripeEntitled,
      entitlements: ents.map((e) => ({
        feature: e.feature,
        source: e.source,
        active: Boolean(e.active),
      })),
    });
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR") return false;
    throw e;
  }
}

module.exports = {
  PAID_SORT_SOURCES,
  storeBillingEnabled,
  computeStoreCheckoutRequired,
  subscriptionSourceFrom,
  hasActiveStoreEntitlement,
  storeCheckoutRequiredForAccount,
};
