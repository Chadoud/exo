/**
 * Local preferences: "Stay signed in" (remember cloud session on disk vs clear on quit).
 * Stored in userData/cloud_session_prefs.json (migrated from legacy beta_prefs.json).
 */

const fs = require("fs");
const path = require("path");

const PREFS_FILENAME = "cloud_session_prefs.json";
const LEGACY_PREFS_FILENAME = "beta_prefs.json";

function prefsPath(userData) {
  return path.join(userData, PREFS_FILENAME);
}

function legacyPrefsPath(userData) {
  return path.join(userData, LEGACY_PREFS_FILENAME);
}

function readJsonSafe(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

/** One-time migration from beta_prefs.json when the new file is absent. */
function migrateLegacyPrefs(userData) {
  const nextPath = prefsPath(userData);
  if (fs.existsSync(nextPath)) return;
  const legacyPath = legacyPrefsPath(userData);
  if (!fs.existsSync(legacyPath)) return;
  try {
    const raw = fs.readFileSync(legacyPath, "utf8");
    fs.mkdirSync(path.dirname(nextPath), { recursive: true });
    fs.writeFileSync(nextPath, raw, "utf8");
  } catch (err) {
    console.warn("[cloudSessionPrefs] legacy migration failed:", err && err.message);
  }
}

/** Default false: clear the cloud session on quit unless the user opts in. */
function getRememberDevice(userData) {
  migrateLegacyPrefs(userData);
  const d = readJsonSafe(prefsPath(userData), { rememberDevice: false });
  return d.rememberDevice === true;
}

function setRememberDevice(userData, value) {
  migrateLegacyPrefs(userData);
  const p = prefsPath(userData);
  const prev = readJsonSafe(p, {});
  const next = { ...prev, rememberDevice: Boolean(value) };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), "utf8");
}

module.exports = {
  getRememberDevice,
  setRememberDevice,
};
