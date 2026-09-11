/**
 * App Store Server API + ASSN v2 signedPayload verify.
 * Notification JWS is auth; subscription status is always re-fetched.
 */

const { createPublicKey, X509Certificate } = require("crypto");
const { compactVerify, importPKCS8, SignJWT } = require("jose");
const config = require("./config");
const { httpError, defaultHttpRequest } = require("./storeHttp");
const { mapAppleNumericStatus } = require("./storeStatus");

/** Apple Root CA - G3 (public). ASSN x5c chains must terminate here. */
const APPLE_ROOT_CA_G3 = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQKDB1BcHBsZSBJbmMuIC0gQXBwbGUg
Q2VydGlmaWNhdGlvbjEmMCQGA1UECwwdQXBwbGUgQ2VydGlmaWNhdGlvbiBBdXRo
b3JpdHkwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQD
DBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAoMHUFwcGxlIEluYy4gLSBBcHBs
ZSBDZXJ0aWZpY2F0aW9uMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1
dGhvcml0eTB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJyghIQd55B
FFnkS7w8wVCgBsTl3BSQubL6ouMYWjXPxkFE9yt3HoNo3NiyXLVLN0jxQqWikfpL
GAzy3sttVVlGhPLIxR2mC+A7BgKIM8BnCn42CjaoHWQYSDhBAgkA7N8zQqOBtjCB
szASBgNVHRMBAf8ECDAGAQH/AgEAMB0GA1UdDgQWBBT4SGE5Kj9u6f/E+xpVWw33
ty3asjAfBgNVHSMEGDAWgBQ5I3m2FudYSDp2P05V+PEytvdE9zAOBgNVHQ8BAf8E
BAMCAQYwNAYIKwYBBQUHAQEEKDAmMCQGCCsGAQUFBzABhhhodHRwOi8vb2NzcC5h
cHBsZS5jb20vb2NzcDA3BgNVHR8EMDAuMCygKqAohiZodHRwOi8vY3JsLmFwcGxl
LmNvbS9hcHBsZXJvb3RjYWczLmNybDAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0E
AwMDaAAwZQIxAOXt+8S1g9S9vvSUZf9rFEgYW9ipE5jRAFLvZS5AmxmF+aq2NQZx
GTv32l+e+f8xAwIwMrZbNXnF8RNAIswZjhZJ5Dn7AvsPOgmvxJs7m7J8ekqgT0vM
RYnlj2Nvw2c/
-----END CERTIFICATE-----`;

function decodeJwsPayload(jws) {
  const parts = String(jws || "").split(".");
  if (parts.length < 2) throw httpError("invalid_store_notification", 401);
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw httpError("invalid_store_notification", 401);
  }
}

function verifyX5cChain(x5c, rootPem) {
  if (!Array.isArray(x5c) || !x5c.length) throw httpError("invalid_store_notification", 401);
  const certs = x5c.map((b64) => new X509Certificate(Buffer.from(String(b64), "base64")));
  for (let i = 0; i < certs.length - 1; i += 1) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      throw httpError("invalid_store_notification", 401);
    }
  }
  const root = new X509Certificate(rootPem);
  const last = certs[certs.length - 1];
  if (last.fingerprint256 !== root.fingerprint256 && !last.verify(root.publicKey)) {
    throw httpError("invalid_store_notification", 401);
  }
  if (new Date(certs[0].validTo) < new Date()) {
    throw httpError("invalid_store_notification", 401);
  }
  return certs[0];
}

/**
 * @param {string} signedPayload compact JWS
 * @param {{ rootPem?: string }} [opts]
 */
async function verifyAppleSignedJws(signedPayload, opts = {}) {
  const parts = String(signedPayload || "").split(".");
  if (parts.length !== 3) throw httpError("invalid_store_notification", 401);
  let header;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    throw httpError("invalid_store_notification", 401);
  }
  const leaf = verifyX5cChain(header.x5c, opts.rootPem || APPLE_ROOT_CA_G3);
  try {
    const { payload } = await compactVerify(signedPayload, createPublicKey(leaf.publicKey));
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    throw httpError("invalid_store_notification", 401);
  }
}

function notificationEnvironment(payload) {
  const raw = String(payload?.data?.environment || payload?.environment || "").toLowerCase();
  return raw === "sandbox" ? "sandbox" : "production";
}

function pokeFromAssnPayload(payload) {
  const signedTx = payload?.data?.signedTransactionInfo;
  const tx = signedTx ? decodeJwsPayload(signedTx) : {};
  const original = tx.originalTransactionId || tx.original_transaction_id;
  if (!original) throw httpError("invalid_store_notification", 422);
  return {
    storeOriginalId: String(original),
    productId: String(tx.productId || tx.product_id || ""),
    environment: notificationEnvironment(payload),
    notificationUUID: String(payload.notificationUUID || ""),
    notificationType: String(payload.notificationType || ""),
  };
}

function appleCredentialsReady() {
  const apple = config.store.apple;
  return Boolean(apple.issuerId && apple.keyId && apple.privateKey);
}

async function appleApiToken(deps = {}) {
  const apple = deps.apple || config.store.apple;
  if (!apple.issuerId || !apple.keyId || !apple.privateKey) {
    throw httpError("store_billing_not_configured", 503);
  }
  const key = await importPKCS8(apple.privateKey, "ES256");
  return new SignJWT({ bid: apple.bundleId })
    .setProtectedHeader({ alg: "ES256", kid: apple.keyId, typ: "JWT" })
    .setIssuer(apple.issuerId)
    .setIssuedAt()
    .setExpirationTime("15m")
    .setAudience("appstoreconnect-v1")
    .sign(key);
}

function storekitHost(environment) {
  return environment === "sandbox"
    ? "https://api.storekit-sandbox.itunes.apple.com"
    : "https://api.storekit.itunes.apple.com";
}

/**
 * @param {{ storeOriginalId: string, environment?: string }} poke
 * @param {{ httpRequest?: Function, apiToken?: string, apple?: object }} [deps]
 */
async function fetchAppleSubscriptionTruth(poke, deps = {}) {
  const httpRequest = deps.httpRequest || defaultHttpRequest;
  const token = deps.apiToken || (await appleApiToken(deps));
  const environment = poke.environment === "sandbox" ? "sandbox" : "production";
  const url = `${storekitHost(environment)}/inApps/v1/subscriptions/${encodeURIComponent(poke.storeOriginalId)}`;
  const res = await httpRequest(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404 && environment !== "sandbox") {
    return fetchAppleSubscriptionTruth({ ...poke, environment: "sandbox" }, { ...deps, apiToken: token });
  }
  if (!res.ok) throw httpError("store_verify_failed", 502);
  const last = res.json?.data?.[0]?.lastTransactions?.[0];
  if (!last?.signedTransactionInfo) throw httpError("store_verify_failed", 502);
  const tx = decodeJwsPayload(last.signedTransactionInfo);
  const renewal = last.signedRenewalInfo ? decodeJwsPayload(last.signedRenewalInfo) : {};
  const expiresAt = tx.expiresDate ? new Date(Number(tx.expiresDate)).toISOString() : null;
  return {
    storeOriginalId: String(tx.originalTransactionId || poke.storeOriginalId),
    productId: String(tx.productId || poke.productId || ""),
    status: mapAppleNumericStatus(last.status, tx.offerType),
    environment: String(tx.environment || environment).toLowerCase() === "sandbox" ? "sandbox" : "production",
    expiresAt,
    autoRenew: Number(renewal.autoRenewStatus) === 1,
  };
}

module.exports = {
  APPLE_ROOT_CA_G3,
  decodeJwsPayload,
  verifyAppleSignedJws,
  pokeFromAssnPayload,
  notificationEnvironment,
  appleCredentialsReady,
  appleApiToken,
  fetchAppleSubscriptionTruth,
};
