/**
 * App Store / Play purchase verify — JWT account only.
 * Client JWS / purchaseToken is a poke; live status comes from fetchStoreTruth.
 * Never log receipts, tokens, or JWS.
 */

const { getPool } = require("./db");
const { computeStoreCheckoutRequired } = require("./storeCheckout");
const { isStoreEntitled, ENTITLED_STORE_STATUSES } = require("./storeStatus");
const { appleCredentialsReady, fetchAppleSubscriptionTruth } = require("./storeApple");
const { playCredentialsReady, fetchPlaySubscriptionTruth } = require("./storePlay");

const EXTRA_KEYS = Object.freeze(["platform", "status", "product_id", "expires_at"]);

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Decode StoreKit 2 JWS payload without trusting its status.
 * @param {string} signedJws
 */
function decodeAppleJwsPoke(signedJws) {
  const parts = String(signedJws || "").split(".");
  if (parts.length < 2) throw httpError("invalid_store_receipt", 422);
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw httpError("invalid_store_receipt", 422);
  }
  const original = payload.originalTransactionId || payload.original_transaction_id;
  if (!original) throw httpError("invalid_store_receipt", 422);
  const envRaw = String(payload.environment || "").toLowerCase();
  return {
    storeOriginalId: String(original),
    productId: String(payload.productId || payload.product_id || ""),
    environment: envRaw === "sandbox" ? "sandbox" : "production",
  };
}

/** @param {object} raw */
function sanitizeStoreExtra(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    platform: src.platform || null,
    status: src.status || null,
    product_id: src.product_id || null,
    expires_at: src.expires_at || null,
  };
}

function assertNoSecretExtra(extra) {
  const keys = extra && typeof extra === "object" ? Object.keys(extra) : [];
  for (const key of keys) {
    if (!EXTRA_KEYS.includes(key)) {
      throw new Error("store_extra_rejected");
    }
  }
}

async function defaultFetchStoreTruth(args) {
  const platform = args?.platform;
  if (platform === "apple") {
    if (!appleCredentialsReady() && !args?.allowUnconfigured) {
      throw httpError("store_billing_not_configured", 503);
    }
    return fetchAppleSubscriptionTruth(args.poke || {}, args);
  }
  if (platform === "play") {
    if (!playCredentialsReady() && !args?.allowUnconfigured) {
      throw httpError("store_billing_not_configured", 503);
    }
    return fetchPlaySubscriptionTruth(args.poke || { purchaseToken: args.purchaseToken }, args);
  }
  throw httpError("store_billing_not_configured", 503);
}

/**
 * @param {object} deps { pool, fetchStoreTruth, expectLivemode }
 * @param {string} accountId
 * @param {{ platform?: string; store_original_id: string; product_id?: string; status: string; environment?: string; expires_at?: string | Date | null; auto_renew?: boolean }} truth
 */
async function bindStoreSubscription(deps, accountId, truth) {
  const pool = deps.pool || getPool();
  const platform = truth.platform;
  const originalId = String(truth.store_original_id || "");
  if (!originalId || (platform !== "apple" && platform !== "play")) {
    throw httpError("invalid_store_receipt", 422);
  }

  const [existing] = await pool.execute(
    "SELECT account_id, retired FROM store_subscriptions WHERE platform = ? AND store_original_id = ? LIMIT 1",
    [platform, originalId],
  );
  if (existing.length) {
    const row = existing[0];
    if (Number(row.retired) === 1) {
      throw httpError("store_owned_by_other_account", 409);
    }
    if (row.account_id && row.account_id !== accountId) {
      throw httpError("store_owned_by_other_account", 409);
    }
  }

  const periodEnd = truth.expires_at ? new Date(truth.expires_at) : null;
  const env = truth.environment === "sandbox" ? "sandbox" : "production";
  await pool.execute(
    `INSERT INTO store_subscriptions
       (account_id, platform, store_original_id, product_id, status, environment, current_period_end, auto_renew, last_event_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       account_id = VALUES(account_id),
       product_id = VALUES(product_id),
       status = VALUES(status),
       environment = VALUES(environment),
       current_period_end = VALUES(current_period_end),
       auto_renew = VALUES(auto_renew),
       last_event_at = UTC_TIMESTAMP()`,
    [
      accountId,
      platform,
      originalId,
      String(truth.product_id || ""),
      String(truth.status || "expired"),
      env,
      periodEnd,
      truth.auto_renew ? 1 : 0,
    ],
  );
}

/**
 * @param {object} deps { pool }
 * @param {string} accountId
 * @param {"apple"|"play"} platform
 * @param {object} truth
 */
async function applyStoreEntitlement(deps, accountId, platform, truth) {
  const pool = deps.pool || getPool();
  const source = platform === "play" ? "play" : "app_store";
  const active = isStoreEntitled(truth.status, truth.expires_at) ? 1 : 0;
  const extra = sanitizeStoreExtra({
    platform,
    status: truth.status,
    product_id: truth.product_id,
    expires_at: truth.expires_at ? new Date(truth.expires_at).toISOString() : null,
  });
  assertNoSecretExtra(extra);
  await pool.execute(
    `INSERT INTO entitlements (account_id, feature, source, active, extra)
     VALUES (?, 'sort', ?, ?, ?)
     ON DUPLICATE KEY UPDATE active = VALUES(active), extra = VALUES(extra)`,
    [accountId, source, active, JSON.stringify(extra)],
  );
}

function parseVerifyBody(body) {
  const platform = body?.platform;
  if (platform !== "apple" && platform !== "play") {
    throw httpError("invalid_platform", 422);
  }
  const signedJws = typeof body?.signed_jws === "string" ? body.signed_jws.trim() : "";
  const purchaseToken = typeof body?.purchase_token === "string" ? body.purchase_token.trim() : "";
  if (platform === "apple" && !signedJws) throw httpError("missing_store_payload", 422);
  if (platform === "play" && !purchaseToken) throw httpError("missing_store_payload", 422);
  return { platform, signedJws, purchaseToken };
}

/**
 * @param {object} deps { pool, fetchStoreTruth, expectLivemode }
 * @param {string} accountId JWT account — never from body
 * @param {object} body
 */
async function verifyStorePurchase(deps, accountId, body) {
  const { platform, signedJws, purchaseToken } = parseVerifyBody(body);
  const expectLivemode =
    deps.expectLivemode !== undefined ? deps.expectLivemode : process.env.STORE_BILLING_LIVE === "1";

  let poke = { storeOriginalId: "", productId: "", environment: "production" };
  if (platform === "apple") {
    poke = decodeAppleJwsPoke(signedJws);
    if (expectLivemode && poke.environment === "sandbox") {
      throw httpError("invalid_store_receipt", 422);
    }
  }

  const fetchTruth = deps.fetchStoreTruth || defaultFetchStoreTruth;
  let truth;
  try {
    truth = await fetchTruth({ platform, poke, signedJws, purchaseToken });
  } catch (e) {
    if (e.status) throw e;
    throw httpError("store_verify_failed", 502);
  }
  if (!truth?.storeOriginalId || !truth.status) throw httpError("store_verify_failed", 502);
  const environment = truth.environment === "sandbox" ? "sandbox" : "production";
  if (expectLivemode && environment === "sandbox") {
    throw httpError("invalid_store_receipt", 422);
  }

  const pool = deps.pool || getPool();
  await bindStoreSubscription(
    { pool },
    accountId,
    {
      platform,
      store_original_id: truth.storeOriginalId,
      product_id: truth.productId || poke.productId,
      status: truth.status,
      environment,
      expires_at: truth.expiresAt || null,
      auto_renew: Boolean(truth.autoRenew),
    },
  );
  await applyStoreEntitlement({ pool }, accountId, platform, {
    status: truth.status,
    product_id: truth.productId || poke.productId,
    expires_at: truth.expiresAt || null,
  });

  const [ents] = await pool.execute(
    "SELECT feature, source, active FROM entitlements WHERE account_id = ?",
    [accountId],
  );
  const required = computeStoreCheckoutRequired({
    enabled: true,
    entitlements: ents.map((e) => ({
      feature: e.feature,
      source: e.source,
      active: Boolean(e.active),
    })),
  });

  return {
    ok: true,
    platform,
    status: String(truth.status),
    expires_at: truth.expiresAt ? new Date(truth.expiresAt).toISOString() : null,
    store_checkout_required: required,
  };
}

/**
 * Restore is the same verify path; callers may pass one purchase or the first hit.
 * @param {object} deps
 * @param {string} accountId
 * @param {object} body
 */
async function restoreStorePurchase(deps, accountId, body) {
  return verifyStorePurchase(deps, accountId, body);
}

module.exports = {
  ENTITLED_STORE_STATUSES,
  decodeAppleJwsPoke,
  sanitizeStoreExtra,
  bindStoreSubscription,
  applyStoreEntitlement,
  verifyStorePurchase,
  restoreStorePurchase,
};
