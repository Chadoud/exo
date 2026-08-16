/**
 * GO SYNC desktop worker — export via local backend, encrypt, push to cloud relay.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { safeStorage } = require("electron");
const cloudAuth = require("./cloudAuth");
const state = require("./state");
const { BACKEND_PORT } = require("./constants");

const SYNC_PREFS = "sync_prefs.json";
const SYNC_KEY_FILE = "sync_master_key.enc";
const SYNC_LOG = "sync_runs.jsonl";
const INTERVAL_MS = 5 * 60 * 1000;

let timer = null;
/** Device userData root (session); prefs/key resolve under active profile. */
let activeDeviceRoot = null;
let lastStatus = {
  enabled: false,
  lastRunAt: null,
  lastError: null,
  pendingCount: 0,
  conflictCount: 0,
  lastBlobCount: 0,
};

function syncRoots(deviceRootHint) {
  const { splitRoots } = require("./accountProfile");
  return splitRoots(deviceRootHint || activeDeviceRoot);
}

function prefsPath(userData) {
  return path.join(userData, SYNC_PREFS);
}

function keyPath(userData) {
  return path.join(userData, SYNC_KEY_FILE);
}

function readPrefs(userData) {
  try {
    const p = prefsPath(userData);
    if (!fs.existsSync(p)) return { enabled: false, deviceId: null, deviceName: "Desktop" };
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { enabled: false, deviceId: null, deviceName: "Desktop" };
  }
}

function writePrefs(userData, prefs) {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(prefsPath(userData), JSON.stringify(prefs, null, 2), "utf8");
}

function appendRunLog(userData, entry) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  fs.appendFileSync(path.join(userData, SYNC_LOG), line, "utf8");
}

function cloudUrl() {
  try {
    return require("./cloudAuth").cloudBaseUrl();
  } catch {
    return (process.env.EXOSITES_CLOUD_URL || "").trim().replace(/\/$/, "");
  }
}

/** Surface pull auth failures even when push-only still returned ok. */
function lastErrorFromSyncRun(data) {
  if (!data || typeof data !== "object") return "sync_failed";
  if (data.ok === false) return data.error || "sync_failed";
  const pull = data.pull;
  if (pull && typeof pull === "object" && typeof pull.error === "string" && pull.error.trim()) {
    return pull.error.trim();
  }
  return null;
}

/**
 * Change-feed cursor for the pull+apply phase (task completions from phones).
 * First run starts at 0 — replaying history once is safe because the backend
 * apply is allowlisted and tolerant of undecryptable legacy rows.
 * @param {unknown} value
 * @returns {number}
 */
function normalizePullCursor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function ensureMasterKey(userData) {
  const kp = keyPath(userData);
  const encOk = safeStorage.isEncryptionAvailable();
  const allowPlain =
    process.env.EXOSITES_INSECURE_LOCAL === "1" || process.env.NODE_ENV === "test";
  if (fs.existsSync(kp)) {
    try {
      const raw = fs.readFileSync(kp);
      if (encOk) {
        return safeStorage.decryptString(raw);
      }
      if (allowPlain) return raw.toString("utf8");
      throw new Error("safeStorage unavailable");
    } catch (err) {
      // Fail closed: regenerating would mint a new key while relay ciphertext
      // stays encrypted under the old one — mobile pairing then "works" but decrypt fails.
      throw new Error(
        `sync_master_key_unreadable: ${err?.message || err}. Unlock Keychain or re-enable GO SYNC after a data reset.`,
      );
    }
  }
  if (!encOk && !allowPlain) {
    throw new Error(
      "sync_master_key_unreadable: secure storage unavailable. Unlock Keychain and retry.",
    );
  }
  const keyB64 = crypto.randomBytes(32).toString("base64");
  fs.mkdirSync(userData, { recursive: true });
  if (encOk) {
    fs.writeFileSync(kp, safeStorage.encryptString(keyB64));
  } else {
    fs.writeFileSync(kp, keyB64, "utf8");
  }
  return keyB64;
}

async function runSyncOnce(deviceRootHint) {
  const { deviceRoot, profileRoot } = syncRoots(deviceRootHint);
  const base = cloudUrl();
  if (!base) {
    lastStatus = { ...lastStatus, lastError: "cloud_url_not_configured" };
    return lastStatus;
  }
  const prefs = readPrefs(profileRoot);
  if (!prefs.enabled) {
    lastStatus = { ...lastStatus, enabled: false };
    return lastStatus;
  }
  const session = await cloudAuth.ensureFreshSession(deviceRoot);
  if (!session?.access_token) {
    lastStatus = { ...lastStatus, lastError: "not_logged_in" };
    return lastStatus;
  }
  const masterKeyB64 = ensureMasterKey(profileRoot);
  const deviceId = prefs.deviceId || crypto.randomUUID();
  if (!prefs.deviceId) {
    prefs.deviceId = deviceId;
    writePrefs(profileRoot, prefs);
  }
  const accountId =
    session.account_id ||
    (() => {
      try {
        const { accountIdFromAccessToken } = require("./accountProfile");
        return accountIdFromAccessToken(session.access_token);
      } catch {
        return null;
      }
    })();
  if (!accountId) {
    lastStatus = { ...lastStatus, lastError: "account_id_missing" };
    return lastStatus;
  }
  const token = state.appToken || "";
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-App-Token"] = token;

  try {
    const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/sync/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        cloud_url: base,
        access_token: session.access_token,
        master_key_b64: masterKeyB64,
        device_id: deviceId,
        account_id: accountId,
        since_updated_at: prefs.lastSyncedAt || null,
        pull_cursor: normalizePullCursor(prefs.pullCursor),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || `sync_run_${res.status}`);
    }
    if (data.ok) {
      if (data.finished_at) {
        prefs.lastSyncedAt = data.finished_at;
      }
      // Guarded so an older backend without the field can't reset the cursor.
      if (typeof data.next_pull_cursor === "number") {
        prefs.pullCursor = normalizePullCursor(data.next_pull_cursor);
      }
      writePrefs(profileRoot, prefs);
    }
    lastStatus = {
      enabled: true,
      lastRunAt: new Date().toISOString(),
      lastError: lastErrorFromSyncRun(data),
      pendingCount: 0,
      conflictCount: 0,
      lastBlobCount: data.blob_count ?? data.pushed ?? 0,
    };
    appendRunLog(profileRoot, { ok: data.ok !== false, sync_run_id: data.sync_run_id, ...data });
  } catch (err) {
    lastStatus = {
      ...lastStatus,
      enabled: true,
      lastRunAt: new Date().toISOString(),
      lastError: err instanceof Error ? err.message : String(err),
    };
    appendRunLog(profileRoot, { ok: false, error: lastStatus.lastError });
  }
  return lastStatus;
}

function startSyncWorker(deviceRoot) {
  activeDeviceRoot = deviceRoot || activeDeviceRoot;
  if (timer) return;
  timer = setInterval(() => {
    void runSyncOnce(activeDeviceRoot);
  }, INTERVAL_MS);
}

function stopSyncWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

function clearLastError() {
  lastStatus = { ...lastStatus, lastError: null };
}

function getSyncStatus(deviceRootHint) {
  const { profileRoot } = syncRoots(deviceRootHint);
  const prefs = readPrefs(profileRoot);
  return {
    ...lastStatus,
    /** ISO time of last successful push (prefs) — used for Sync-before-pair gate. */
    lastSuccessfulSyncAt: prefs.lastSyncedAt || null,
  };
}

function setSyncEnabled(deviceRootHint, enabled) {
  const { profileRoot } = syncRoots(deviceRootHint);
  const prefs = readPrefs(profileRoot);
  const nextEnabled = Boolean(enabled);
  if (!prefs.deviceId) prefs.deviceId = crypto.randomUUID();
  // Fail closed before persisting enabled=true when the existing key is unreadable.
  if (nextEnabled) ensureMasterKey(profileRoot);
  prefs.enabled = nextEnabled;
  writePrefs(profileRoot, prefs);
  lastStatus.enabled = prefs.enabled;
  return prefs;
}

/**
 * Build pairing JSON (v2): master key + cloud URL + account-bound grant token.
 * @param {string} deviceRootHint
 * @returns {Promise<object>}
 */
async function getPairingPayload(deviceRootHint) {
  const { profileRoot, deviceRoot } = syncRoots(deviceRootHint);
  const base = cloudUrl();
  if (!base) {
    throw new Error("cloud_url_not_configured");
  }
  const prefs = readPrefs(profileRoot);
  if (!prefs.enabled) {
    throw new Error("sync_not_enabled");
  }
  const masterKeyB64 = ensureMasterKey(profileRoot);
  const session = cloudAuth.readSession(deviceRoot || activeDeviceRoot);
  if (!session?.access_token) {
    throw new Error("not_logged_in");
  }
  const accountId =
    session.account_id ||
    (() => {
      try {
        const { accountIdFromAccessToken } = require("./accountProfile");
        return accountIdFromAccessToken(session.access_token);
      } catch {
        return null;
      }
    })();
  if (!accountId) {
    throw new Error("account_id_missing");
  }
  const keyFingerprint = crypto
    .createHash("sha256")
    .update(Buffer.from(masterKeyB64, "base64"))
    .digest("hex");
  const grantRes = await fetch(`${base.replace(/\/$/, "")}/v1/sync/pairing/grants`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ key_fingerprint: keyFingerprint }),
  });
  const grant = await grantRes.json().catch(() => ({}));
  if (!grantRes.ok || !grant.grant_token) {
    throw new Error(grant.detail || `pairing_grant_${grantRes.status}`);
  }
  return {
    v: 2,
    cloud_url: base,
    master_key_b64: masterKeyB64,
    account_id: accountId,
    grant_token: grant.grant_token,
    issued_at: new Date().toISOString(),
    expires_at: grant.expires_at || null,
  };
}

/**
 * Build pairing QR in main so the renderer never receives master_key_b64.
 * @param {string} userData
 * @returns {Promise<{ dataUrl: string }>}
 */
async function getPairingQrDataUrl(userData) {
  const QRCode = require("qrcode");
  const payload = await getPairingPayload(userData);
  const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), { margin: 1, width: 220 });
  return { dataUrl };
}

/**
 * Copy the same JSON as the QR onto the system clipboard from main.
 * Renderer never receives master_key_b64 (paste on mobile for Simulator / no-camera).
 * @param {string} userData
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
async function copyPairingPayloadToClipboard(userData) {
  const { clipboard } = require("electron");
  try {
    const payload = await getPairingPayload(userData);
    clipboard.writeText(JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

module.exports = {
  startSyncWorker,
  stopSyncWorker,
  clearLastError,
  runSyncOnce,
  normalizePullCursor,
  lastErrorFromSyncRun,
  getSyncStatus,
  setSyncEnabled,
  readPrefs,
  getPairingPayload,
  getPairingQrDataUrl,
  copyPairingPayloadToClipboard,
};
