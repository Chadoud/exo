/**
 * Fail-closed pair gate for new phone redeem/register only.
 * 402 + store_checkout_required — never 403 (that means account mismatch).
 */

const storeCheckout = require("../lib/storeCheckout");

async function requireStoreCheckout(req, res, next) {
  if (!storeCheckout.storeBillingEnabled()) return next();
  try {
    const required = await storeCheckout.storeCheckoutRequiredForAccount(req.accountId);
    if (!required) return next();
    return res.status(402).json({ detail: "store_checkout_required" });
  } catch (e) {
    if (e?.code === "ER_NO_SUCH_TABLE" || e?.code === "ER_BAD_FIELD_ERROR") {
      return next();
    }
    console.error("[store-checkout] lookup failed:", e?.message || e);
    return res.status(503).json({ detail: "store_checkout_required" });
  }
}

module.exports = { requireStoreCheckout };
