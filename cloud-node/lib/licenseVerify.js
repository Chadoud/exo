/**
 * Server-side counterpart to `electron/entitlement/verify.js` /
 * `backend/license_verify.py`. Unlike those, this never checks a `machine_id`
 * against "the current device" — the server has no such concept. Device
 * binding is enforced by `licenseActivations.js` instead, keyed by
 * `payload.license_id`.
 */

const ed = require("@noble/ed25519");
const { LICENSE_PREFIX, PRODUCT_SLUG } = require("./licenseConstants");
// Not destructured: tests reassign `licenseConstants.EMBEDDED_LICENSE_PUBLIC_KEY_HEX`
// to verify against a throwaway keypair instead of the real embedded one.
const licenseConstants = require("./licenseConstants");

/** Same canonical form as the Electron/Python signers. */
function canonicalLicensePayload(obj) {
  const ordered = {};
  for (const k of Object.keys(obj).sort()) {
    ordered[k] = obj[k];
  }
  return JSON.stringify(ordered);
}

/**
 * @param {string} licenseKey
 * @returns {Promise<{ ok: boolean, reason?: string, payload?: { license_id: string, max_seats: number, product: string, tier: string, iat: number } }>}
 */
async function verifyLicenseKey(licenseKey) {
  const trimmed = typeof licenseKey === "string" ? licenseKey.trim() : "";
  if (!trimmed) {
    return { ok: false, reason: "empty" };
  }
  const parts = trimmed.split(".");
  if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
    return { ok: false, reason: "format" };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "payload" };
  }
  if (payload.product !== PRODUCT_SLUG) {
    return { ok: false, reason: "product" };
  }
  if (payload.tier !== "full") {
    return { ok: false, reason: "tier" };
  }
  if (typeof payload.license_id !== "string" || !payload.license_id) {
    return { ok: false, reason: "license_id" };
  }
  const maxSeats = Number(payload.max_seats);
  if (!Number.isInteger(maxSeats) || maxSeats < 1) {
    return { ok: false, reason: "max_seats" };
  }
  let sig;
  try {
    sig = Buffer.from(parts[2], "base64url");
  } catch {
    return { ok: false, reason: "sig_format" };
  }
  if (sig.length !== 64) {
    return { ok: false, reason: "sig_len" };
  }
  const message = new TextEncoder().encode(canonicalLicensePayload(payload));
  const pub = Uint8Array.from(Buffer.from(licenseConstants.EMBEDDED_LICENSE_PUBLIC_KEY_HEX, "hex"));
  const valid = await ed.verifyAsync(Uint8Array.from(sig), message, pub);
  if (!valid) {
    return { ok: false, reason: "sig_verify" };
  }
  return { ok: true, payload };
}

module.exports = { verifyLicenseKey, canonicalLicensePayload };
