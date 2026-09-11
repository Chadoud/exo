/**
 * Account-deletion side of store billing.
 * Apple cannot be cancelled by EXO. Play is cancelled when we still have a token.
 * Store identity rows stay retired so a receipt cannot entitle a new account.
 */

const { getPool } = require("./db");
const { cancelPlaySubscription } = require("./storePlay");
const { exportStoreSubscriptionMeta } = require("./storeManage");

async function listStoreSubscriptions(pool, accountId) {
  try {
    const [rows] = await pool.execute(
      `SELECT platform, store_original_id, product_id, status, current_period_end, auto_renew, retired
       FROM store_subscriptions WHERE account_id = ? AND retired = 0`,
      [accountId],
    );
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR") return [];
    throw e;
  }
}

/**
 * @param {string} accountId
 * @param {{ pool?: object, cancelPlay?: Function }} [deps]
 */
async function retireStoreSubscriptionsForDeletion(accountId, deps = {}) {
  const pool = deps.pool || getPool();
  const rows = await listStoreSubscriptions(pool, accountId);
  const cancelPlay = deps.cancelPlay || cancelPlaySubscription;
  for (const row of rows) {
    if (row.platform !== "play") continue;
    try {
      const result = await cancelPlay({
        productId: row.product_id,
        purchaseToken: row.store_original_id,
      });
      if (!result?.ok) {
        console.error("[billing] ALERT could not cancel Play subscription during account deletion");
      }
    } catch (e) {
      console.error("[billing] ALERT could not cancel Play subscription during account deletion:", e?.message || e);
    }
  }

  try {
    await pool.execute(
      `UPDATE entitlements SET active = 0
       WHERE account_id = ? AND source IN ('app_store', 'play')`,
      [accountId],
    );
  } catch (e) {
    if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
  }

  try {
    await pool.execute(
      `UPDATE store_subscriptions
       SET account_id = NULL, retired = 1, status = 'canceled', auto_renew = 0
       WHERE account_id = ?`,
      [accountId],
    );
  } catch (e) {
    if (e?.code !== "ER_NO_SUCH_TABLE" && e?.code !== "ER_BAD_FIELD_ERROR") throw e;
  }

  try {
    await pool.execute(
      "UPDATE store_events_processed SET account_id = NULL WHERE account_id = ?",
      [accountId],
    );
  } catch (e) {
    if (e?.code !== "ER_NO_SUCH_TABLE") throw e;
  }

  return rows.map(exportStoreSubscriptionMeta);
}

module.exports = { listStoreSubscriptions, retireStoreSubscriptionsForDeletion };
