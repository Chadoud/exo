const crypto = require("crypto");
const { getPool } = require("./db");

const WAKE_TASK_DUE = "task_due";
const WAKE_ACTION_READY = "action_ready";
const ALLOWED_TYPES = new Set([WAKE_TASK_DUE, WAKE_ACTION_READY]);
const MAX_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;
const GENERIC = {
  [WAKE_TASK_DUE]: { title: "Task due", body: "Open Tasks to see which one." },
  [WAKE_ACTION_READY]: { title: "Ready to review", body: "Something is ready to review." },
};

/** @type {Map<string, number[]>} */
const _buckets = new Map();

function tokenFingerprint(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 8);
}

function wakeTypesFromBlobs(blobs) {
  const types = new Set();
  for (const blob of blobs || []) {
    const collection = String(blob?.collection || "");
    if (collection === "tasks") types.add(WAKE_TASK_DUE);
    if (collection === "pending_actions") types.add(WAKE_ACTION_READY);
  }
  return [...types];
}

function _allow(accountId, now) {
  const t = now();
  const prev = (_buckets.get(accountId) || []).filter((ts) => t - ts < HOUR_MS);
  if (prev.length >= MAX_PER_HOUR) {
    _buckets.set(accountId, prev);
    return false;
  }
  prev.push(t);
  _buckets.set(accountId, prev);
  return true;
}

function resetRateLimitForTests() {
  _buckets.clear();
}

async function listPushTargets(accountId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, platform, push_token
     FROM sync_devices
     WHERE account_id = ? AND push_token IS NOT NULL AND push_token != ''`,
    [accountId],
  );
  return (rows || []).map((row) => ({
    id: String(row.id),
    platform: String(row.platform || ""),
    token: String(row.push_token || ""),
  })).filter((row) => row.token);
}

async function clearPushToken(deviceId) {
  const pool = getPool();
  await pool.query("UPDATE sync_devices SET push_token = NULL WHERE id = ?", [deviceId]);
}

/**
 * Send a content-free wake. Logs token fingerprints only.
 * @param {string} accountId
 * @param {string} type
 * @param {{ send?: Function; now?: () => number; listTargets?: Function }} [deps]
 */
async function wakeAccount(accountId, type, deps = {}) {
  if (!ALLOWED_TYPES.has(type)) return { ok: false, reason: "bad_type" };
  const now = deps.now || Date.now;
  if (!_allow(accountId, now)) return { ok: false, reason: "rate_limited" };
  const listTargets = deps.listTargets || listPushTargets;
  const targets = await listTargets(accountId);
  if (!targets.length) return { ok: true, sent: 0, reason: "no_targets" };
  const send = deps.send || defaultSend;
  const copy = GENERIC[type];
  let sent = 0;
  let failed = 0;
  for (const target of targets) {
    const result = await send({
      token: target.token,
      platform: target.platform,
      type,
      title: copy.title,
      body: copy.body,
    });
    if (result && result.invalidate) {
      await clearPushToken(target.id);
    }
    if (result && result.ok) sent += 1;
    else failed += 1;
    if (process.env.EXOSITES_PUSH_DEBUG === "1") {
      console.info("[pushWake]", type, target.platform, tokenFingerprint(target.token));
    }
  }
  return { ok: true, sent, failed };
}

async function defaultSend(payload) {
  const key = (process.env.EXOSITES_FCM_SERVER_KEY || "").trim();
  if (!key) return { ok: false, reason: "no_provider" };
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: payload.token,
      data: { type: payload.type },
      notification: { title: payload.title, body: payload.body },
      priority: "high",
    }),
  });
  if (res.status === 404 || res.status === 410) return { ok: false, invalidate: true };
  if (!res.ok) return { ok: false, reason: `http_${res.status}` };
  return { ok: true };
}

module.exports = {
  wakeAccount,
  wakeTypesFromBlobs,
  tokenFingerprint,
  resetRateLimitForTests,
  WAKE_TASK_DUE,
  WAKE_ACTION_READY,
  MAX_PER_HOUR,
};
