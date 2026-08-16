/**
 * Gmail OAuth mirror for the Python backend — canonical copy in safeStorage;
 * materialize to userData only while the backend runs.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { getSecret, setSecret, clearSecret } = require("./secretsStore");

const SECRET_KEY = "gmail.oauth_mirror";

function legacyHomeMirrorPath() {
  return path.join(os.homedir(), ".ai-file-sorter", "gmail_oauth.json");
}

function materializedMirrorPath(userData) {
  return path.join(userData, "gmail_oauth.json");
}

/**
 * @param {Record<string, unknown>} payload Python-compatible gmail_oauth.json body
 */
function saveGmailOAuthMirror(payload) {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "invalid_payload" };
  return setSecret(SECRET_KEY, JSON.stringify(payload));
}

function clearGmailOAuthMirror() {
  clearSecret(SECRET_KEY);
  return { ok: true };
}

/**
 * Write decrypted mirror JSON for the backend child (0600).
 * @param {string} userData Active profile root (resolveProfileRoot), not device userData
 * @returns {boolean}
 */
function materializeGmailOAuthMirrorForBackend(userData) {
  const raw = getSecret(SECRET_KEY);
  if (!raw || !userData) return false;
  const p = materializedMirrorPath(userData);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, raw, { mode: 0o600 });
    return true;
  } catch (err) {
    console.warn("[gmailOAuthMirror] materialize failed:", err && err.message);
    return false;
  }
}

/** Remove ephemeral backend mirror file. */
function deleteMaterializedGmailOAuthMirror(userData) {
  if (!userData) return;
  try {
    const p = materializedMirrorPath(userData);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

/**
 * After a backend child exits: keep the plaintext mirror if something else still
 * owns 7799 (failed bind / second app). Only wipe when the port is free.
 * @param {string | undefined} userData
 * @param {boolean} portHeld
 */
function reconcileGmailOAuthMirrorAfterBackendExit(userData, portHeld) {
  if (!userData) return;
  if (portHeld) {
    materializeGmailOAuthMirrorForBackend(userData);
    return;
  }
  deleteMaterializedGmailOAuthMirror(userData);
}

/** Move legacy ~/.ai-file-sorter/gmail_oauth.json into safeStorage. */
function migrateLegacyHomeGmailMirror() {
  const legacy = legacyHomeMirrorPath();
  if (!fs.existsSync(legacy)) return { migrated: false };
  if (getSecret(SECRET_KEY)) {
    try {
      fs.unlinkSync(legacy);
    } catch {
      /* ignore */
    }
    return { migrated: false, removedLegacy: true };
  }
  try {
    const content = fs.readFileSync(legacy, "utf8");
    JSON.parse(content);
    setSecret(SECRET_KEY, content);
    fs.unlinkSync(legacy);
    return { migrated: true };
  } catch (err) {
    console.warn("[gmailOAuthMirror] legacy migrate failed:", err && err.message);
    return { migrated: false };
  }
}

module.exports = {
  legacyHomeMirrorPath,
  materializedMirrorPath,
  saveGmailOAuthMirror,
  clearGmailOAuthMirror,
  materializeGmailOAuthMirrorForBackend,
  deleteMaterializedGmailOAuthMirror,
  reconcileGmailOAuthMirrorAfterBackendExit,
  migrateLegacyHomeGmailMirror,
};
