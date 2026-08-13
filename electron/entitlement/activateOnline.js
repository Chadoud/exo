const cloudAuth = require("../cloudAuth");

const ACTIVATE_TIMEOUT_MS = 10_000;

/**
 * First-use device binding for an offline license key (see tools/license-keygen).
 * The signed key is the credential — no account/session required. Called
 * once, silently, whenever a client pastes a key into Settings.
 *
 * @param {string} licenseKey
 * @param {string} machineId
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function activateLicenseOnline(licenseKey, machineId) {
  const base = cloudAuth.cloudBaseUrl();
  if (!base) {
    return { ok: false, reason: "cloud_url_unset" };
  }
  let res;
  try {
    res = await fetch(`${base}/v1/licenses/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ license_key: licenseKey, machine_id: machineId }),
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

module.exports = { activateLicenseOnline };
