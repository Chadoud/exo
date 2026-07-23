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
  return (process.env.EXOSITES_CLOUD_URL || "").trim().replace(/\/$/, "");
}

function ensureMasterKey(userData) {
  const kp = keyPath(userData);
  if (fs.existsSync(kp)) {
    try {
      const raw = fs.readFileSync(kp);
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(raw);
      }
      return raw.toString("utf8");
    } catch {
      /* regenerate below */
    }
  }
  const keyB64 = crypto.randomBytes(32).toString("base64");
  fs.mkdirSync(userData, { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
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
  const session = cloudAuth.readSession(deviceRoot);
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
        since_updated_at: prefs.lastSyncedAt || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || `sync_run_${res.status}`);
    }
    if (data.ok && data.finished_at) {
      prefs.lastSyncedAt = data.finished_at;
      writePrefs(profileRoot, prefs);
    }
    lastStatus = {
      enabled: true,
      lastRunAt: new Date().toISOString(),
      lastError: data.ok ? null : data.error || "sync_failed",
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

function getSyncStatus() {
  return { ...lastStatus };
}

function setSyncEnabled(deviceRootHint, enabled) {
  const { profileRoot } = syncRoots(deviceRootHint);
  const prefs = readPrefs(profileRoot);
  prefs.enabled = Boolean(enabled);
  if (!prefs.deviceId) prefs.deviceId = crypto.randomUUID();
  if (prefs.enabled) ensureMasterKey(profileRoot);
  writePrefs(profileRoot, prefs);
  lastStatus.enabled = prefs.enabled;
  return prefs;
}

function getPairingPayload(deviceRootHint) {
  const { profileRoot } = syncRoots(deviceRootHint);
  const base = cloudUrl();
  if (!base) {
    throw new Error("cloud_url_not_configured");
  }
  const prefs = readPrefs(profileRoot);
  if (!prefs.enabled) {
    throw new Error("sync_not_enabled");
  }
  const masterKeyB64 = ensureMasterKey(profileRoot);
  return {
    v: 1,
    cloud_url: base,
    master_key_b64: masterKeyB64,
    issued_at: new Date().toISOString(),
  };
}

/**
 * Build pairing QR in main so the renderer never receives master_key_b64.
 * @param {string} userData
 * @returns {Promise<{ dataUrl: string }>}
 */
async function getPairingQrDataUrl(userData) {
  const QRCode = require("qrcode");
  const payload = getPairingPayload(userData);
  const dataUrl = await QRCode.toDataURL(JSON.stringify(payload), { margin: 1, width: 220 });
  return { dataUrl };
}

/**
 * Copy the same JSON as the QR onto the system clipboard from main.
 * Renderer never receives master_key_b64 (paste on mobile for Simulator / no-camera).
 * @param {string} userData
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function copyPairingPayloadToClipboard(userData) {
  const { clipboard } = require("electron");
  try {
    const payload = getPairingPayload(userData);
    clipboard.writeText(JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

module.exports = {
  startSyncWorker,
  stopSyncWorker,
  runSyncOnce,
  getSyncStatus,
  setSyncEnabled,
  readPrefs,
  getPairingPayload,
  getPairingQrDataUrl,
  copyPairingPayloadToClipboard,
};
