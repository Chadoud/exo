/**
 * App Store / Play notification processing.
 * Signature/OIDC is auth. Event payload is a poke; live status is re-fetched.
 */

const { getPool } = require("./db");
const { bindStoreSubscription, applyStoreEntitlement } = require("./storeBilling");
const {
  verifyAppleSignedJws,
  pokeFromAssnPayload,
  notificationEnvironment,
  fetchAppleSubscriptionTruth,
} = require("./storeApple");
const { verifyPlayOidc, parsePlayRtdnData, fetchPlaySubscriptionTruth } = require("./storePlay");
const { httpError } = require("./storeHttp");

async function recordStoreEvent(conn, eventId, provider, eventType, accountId) {
  const [inserted] = await conn.execute(
    "INSERT IGNORE INTO store_events_processed (event_id, provider, event_type, account_id) VALUES (?, ?, ?, ?)",
    [eventId, provider, eventType || null, accountId],
  );
  return inserted.affectedRows > 0;
}

async function lookupStoreBinding(pool, platform, storeOriginalId) {
  const [rows] = await pool.execute(
    "SELECT account_id, retired FROM store_subscriptions WHERE platform = ? AND store_original_id = ? LIMIT 1",
    [platform, storeOriginalId],
  );
  return rows[0] || null;
}

async function applyLiveStoreTruth(pool, accountId, platform, truth) {
  await bindStoreSubscription(
    { pool },
    accountId,
    {
      platform,
      store_original_id: truth.storeOriginalId,
      product_id: truth.productId,
      status: truth.status,
      environment: truth.environment,
      expires_at: truth.expiresAt || null,
      auto_renew: Boolean(truth.autoRenew),
    },
  );
  await applyStoreEntitlement({ pool }, accountId, platform, {
    status: truth.status,
    product_id: truth.productId,
    expires_at: truth.expiresAt || null,
  });
}

function assertLiveEnvironment(environment, expectLivemode) {
  if (expectLivemode && environment === "sandbox") {
    console.error("[billing] ALERT ignoring store notification: livemode mismatch (sandbox vs live)");
    return false;
  }
  return true;
}

/**
 * @param {object} deps
 * @param {object} body { signedPayload }
 */
async function processAppleNotification(deps, body) {
  const signedPayload = typeof body?.signedPayload === "string" ? body.signedPayload : "";
  if (!signedPayload) throw httpError("invalid_store_notification", 422);
  const verify = deps.verifyAppleSignedJws || verifyAppleSignedJws;
  const payload = await verify(signedPayload);
  const eventId = String(payload.notificationUUID || "");
  if (!eventId) throw httpError("invalid_store_notification", 422);
  const environment = notificationEnvironment(payload);
  const expectLivemode = deps.expectLivemode !== undefined ? deps.expectLivemode : process.env.STORE_BILLING_LIVE === "1";
  if (!assertLiveEnvironment(environment, expectLivemode)) {
    return { ok: true, ignored: "livemode_mismatch" };
  }

  const poke = pokeFromAssnPayload(payload);
  const fetchTruth = deps.fetchStoreTruth || ((args) => fetchAppleSubscriptionTruth(args.poke, deps));
  let truth;
  try {
    truth = await fetchTruth({ platform: "apple", poke });
  } catch (e) {
    if (e.status) throw e;
    throw httpError("store_verify_failed", 502);
  }

  const pool = deps.pool || getPool();
  const binding = await lookupStoreBinding(pool, "apple", truth.storeOriginalId);
  if (binding?.retired) {
    return { ok: true, handled: "retired" };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const inserted = await recordStoreEvent(conn, eventId, "apple", poke.notificationType, binding?.account_id || null);
    if (!inserted) {
      await conn.rollback();
      return { ok: true, deduped: true };
    }
    if (binding?.account_id) {
      await applyLiveStoreTruth(conn, binding.account_id, "apple", truth);
    }
    await conn.commit();
    return { ok: true, handled: binding?.account_id ? poke.notificationType : "unbound" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * @param {object} deps
 * @param {object} body Pub/Sub push envelope
 * @param {string} authorization
 */
async function processPlayNotification(deps, body, authorization) {
  const verifyAuth = deps.verifyPlayOidc || verifyPlayOidc;
  if (!deps.skipPlayAuth) {
    await verifyAuth(authorization, { audience: deps.playAudience, jwks: deps.playJwks });
  }
  const messageId = String(body?.message?.messageId || "");
  const dataB64 = body?.message?.data;
  if (!messageId || !dataB64) throw httpError("invalid_store_notification", 422);
  const parsed = parsePlayRtdnData(dataB64);
  if (parsed.ignored) {
    return { ok: true, ignored: "not_subscription" };
  }

  const expectLivemode = deps.expectLivemode !== undefined ? deps.expectLivemode : process.env.STORE_BILLING_LIVE === "1";
  const fetchTruth = deps.fetchStoreTruth || ((args) => fetchPlaySubscriptionTruth(args.poke, deps));
  let truth;
  try {
    truth = await fetchTruth({
      platform: "play",
      poke: { purchaseToken: parsed.purchaseToken, packageName: parsed.packageName, productId: parsed.productId },
    });
  } catch (e) {
    if (e.status) throw e;
    throw httpError("store_verify_failed", 502);
  }
  if (!assertLiveEnvironment(truth.environment, expectLivemode)) {
    return { ok: true, ignored: "livemode_mismatch" };
  }

  const pool = deps.pool || getPool();
  const binding = await lookupStoreBinding(pool, "play", truth.storeOriginalId);
  if (binding?.retired) {
    return { ok: true, handled: "retired" };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const inserted = await recordStoreEvent(
      conn,
      `play:${messageId}`,
      "play",
      parsed.notificationType != null ? String(parsed.notificationType) : "rtdn",
      binding?.account_id || null,
    );
    if (!inserted) {
      await conn.rollback();
      return { ok: true, deduped: true };
    }
    if (binding?.account_id) {
      await applyLiveStoreTruth(conn, binding.account_id, "play", truth);
    }
    await conn.commit();
    return { ok: true, handled: binding?.account_id ? "rtdn" : "unbound" };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { processAppleNotification, processPlayNotification, applyLiveStoreTruth };
