/**
 * Play Developer API + RTDN decode. Pub/Sub OIDC is auth; status is re-fetched.
 */

const jwt = require("jsonwebtoken");
const { createRemoteJWKSet, jwtVerify } = require("jose");
const config = require("./config");
const { httpError, defaultHttpRequest } = require("./storeHttp");
const { mapPlaySubscriptionState } = require("./storeStatus");

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

function playCredentialsReady() {
  return Boolean(config.store.play.serviceAccountJson);
}

function parseServiceAccount(raw) {
  const source = raw || config.store.play.serviceAccountJson;
  if (!source) throw httpError("store_billing_not_configured", 503);
  try {
    return typeof source === "string" ? JSON.parse(source) : source;
  } catch {
    throw httpError("store_billing_not_configured", 503);
  }
}

function playRtdnAudience() {
  return config.store.play.rtdnAudience || `${config.appBaseUrl}/v1/webhooks/play`;
}

/**
 * @param {string} authorization Bearer token from Pub/Sub
 * @param {{ audience?: string, jwks?: import("jose").JWTVerifyGetKey }} [opts]
 */
async function verifyPlayOidc(authorization, opts = {}) {
  const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw httpError("invalid_store_notification", 401);
  try {
    const { payload } = await jwtVerify(token, opts.jwks || GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: opts.audience || playRtdnAudience(),
    });
    return payload;
  } catch {
    throw httpError("invalid_store_notification", 401);
  }
}

function parsePlayRtdnData(dataB64) {
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(String(dataB64 || ""), "base64").toString("utf8"));
  } catch {
    throw httpError("invalid_store_notification", 422);
  }
  const sub = decoded.subscriptionNotification;
  if (!sub) return { ignored: true, decoded };
  const purchaseToken = String(sub.purchaseToken || "");
  if (!purchaseToken) throw httpError("invalid_store_notification", 422);
  return {
    ignored: false,
    packageName: String(decoded.packageName || config.store.play.packageName),
    purchaseToken,
    productId: String(sub.subscriptionId || ""),
    notificationType: sub.notificationType,
  };
}

async function playAccessToken(deps = {}) {
  if (deps.accessToken) return deps.accessToken;
  const sa = parseServiceAccount(deps.serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: PLAY_SCOPE,
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    { algorithm: "RS256" },
  );
  const httpRequest = deps.httpRequest || defaultHttpRequest;
  const tokenUrl = sa.token_uri || "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }).toString();
  const res = await httpRequest(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok || !res.json?.access_token) throw httpError("store_verify_failed", 502);
  return res.json.access_token;
}

/**
 * @param {{ purchaseToken: string, packageName?: string }} poke
 * @param {{ httpRequest?: Function, accessToken?: string }} [deps]
 */
async function fetchPlaySubscriptionTruth(poke, deps = {}) {
  const token = String(poke.purchaseToken || "");
  if (!token) throw httpError("invalid_store_receipt", 422);
  const pkg = poke.packageName || config.store.play.packageName;
  const access = await playAccessToken(deps);
  const httpRequest = deps.httpRequest || defaultHttpRequest;
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(pkg)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`;
  const res = await httpRequest(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) throw httpError("store_verify_failed", 502);
  const body = res.json || {};
  const item = Array.isArray(body.lineItems) ? body.lineItems[0] : null;
  const expiresAt = item?.expiryTime || body.expiryTime || null;
  const offerTrial = Boolean(item?.offerDetails);
  return {
    storeOriginalId: String(body.linkedPurchaseToken || token),
    productId: String(item?.productId || poke.productId || ""),
    status: mapPlaySubscriptionState(body.subscriptionState, offerTrial),
    environment: body.testPurchase ? "sandbox" : "production",
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    autoRenew: Boolean(item?.autoRenewingPlan?.autoRenewEnabled),
    purchaseToken: token,
  };
}

/**
 * Best-effort Play cancel. Tokens never leave this function in logs.
 * @param {{ packageName?: string, productId: string, purchaseToken: string }} input
 */
async function cancelPlaySubscription(input, deps = {}) {
  const token = String(input.purchaseToken || "");
  const sku = String(input.productId || "");
  if (!token || !sku) return { ok: false, skipped: true };
  const pkg = input.packageName || config.store.play.packageName;
  const access = await playAccessToken(deps);
  const httpRequest = deps.httpRequest || defaultHttpRequest;
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(pkg)}/purchases/subscriptions/${encodeURIComponent(sku)}` +
    `/tokens/${encodeURIComponent(token)}:cancel`;
  const res = await httpRequest(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}` },
  });
  return { ok: res.ok, status: res.status };
}

module.exports = {
  playCredentialsReady,
  playRtdnAudience,
  verifyPlayOidc,
  parsePlayRtdnData,
  playAccessToken,
  fetchPlaySubscriptionTruth,
  cancelPlaySubscription,
};
