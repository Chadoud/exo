const cloudAuth = require("../cloudAuth");

const ACTIVATE_TIMEOUT_MS = 10_000;

/**
 * POST to a cloud licensing endpoint with tolerant JSON parsing and
 * detail-surfacing on failure. Token is optional — callers that require a
 * session must pre-flight that check themselves before calling this.
 *
 * @param {string} path
 * @param {{ token?: string, body?: object }} [opts]
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function postToCloud(path, opts = {}) {
  const base = cloudAuth.cloudBaseUrl();
  if (!base) {
    return { ok: false, reason: "cloud_url_unset" };
  }
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (typeof opts.token === "string" && opts.token.trim()) {
    headers.Authorization = `Bearer ${opts.token.trim()}`;
  }
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(opts.body ?? {}),
      signal: AbortSignal.timeout(ACTIVATE_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }
  let data = {};
  try {
    const text = await res.text();
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    return { ok: false, reason: String(data?.detail || `http_${res.status}`) };
  }
  return { ok: true };
}

/**
 * First-use device binding for an offline license key (see tools/license-keygen).
 * The signed key is the credential — no account/session required. When a
 * session token is present, cloud attaches a sort entitlement to that account.
 *
 * @param {string} licenseKey
 * @param {string} machineId
 * @param {string} [accessToken]
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function activateLicenseOnline(licenseKey, machineId, accessToken) {
  return postToCloud("/v1/licenses/activate", {
    token: accessToken,
    body: { license_key: licenseKey, machine_id: machineId },
  });
}

/**
 * Drop the cloud `offline_license` sort row for the signed-in account.
 * @param {string} accessToken
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function detachOfflineLicenseOnline(accessToken) {
  const token = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!token) {
    return { ok: false, reason: "not_logged_in" };
  }
  return postToCloud("/v1/licenses/detach", { token, body: {} });
}

module.exports = { activateLicenseOnline, detachOfflineLicenseOnline };
