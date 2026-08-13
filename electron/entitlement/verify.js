const { loadEd25519 } = require("../crypto/ed25519");
const { LICENSE_PREFIX, PRODUCT_SLUG } = require("./constants");
// Not destructured: tests reassign `embeddedPublicKey.EMBEDDED_LICENSE_PUBLIC_KEY_HEX`
// to verify against a throwaway keypair instead of the real embedded one.
const embeddedPublicKey = require("./embeddedPublicKey");

/** Same canonical form as backend `canonical_license_payload`. */
function canonicalLicensePayload(obj) {
  const ordered = {};
  for (const k of Object.keys(obj).sort()) {
    ordered[k] = obj[k];
  }
  return JSON.stringify(ordered);
}

/**
 * @param {string} licenseKey
 * @returns {Promise<{ ok: boolean, reason?: string, payload?: object }>}
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
  let payloadObj;
  try {
    const raw = Buffer.from(parts[1], "base64url").toString("utf8");
    payloadObj = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "payload" };
  }
  if (payloadObj.product !== PRODUCT_SLUG) {
    return { ok: false, reason: "product" };
  }
  if (payloadObj.tier !== "full") {
    return { ok: false, reason: "tier" };
  }
  if (typeof payloadObj.license_id !== "string" || !payloadObj.license_id) {
    return { ok: false, reason: "license_id" };
  }
  const maxSeats = Number(payloadObj.max_seats);
  if (!Number.isInteger(maxSeats) || maxSeats < 1) {
    return { ok: false, reason: "max_seats" };
  }
  const message = new TextEncoder().encode(canonicalLicensePayload(payloadObj));
  let sig;
  try {
    sig = Buffer.from(parts[2], "base64url");
  } catch {
    return { ok: false, reason: "sig_format" };
  }
  if (sig.length !== 64) {
    return { ok: false, reason: "sig_len" };
  }
  const pub = Uint8Array.from(Buffer.from(embeddedPublicKey.EMBEDDED_LICENSE_PUBLIC_KEY_HEX, "hex"));
  const loaded = await loadEd25519();
  if (!loaded.ok) {
    return { ok: false, reason: loaded.reason || "crypto_unavailable" };
  }
  const ok = await loaded.ed.verifyAsync(Uint8Array.from(sig), message, pub);
  if (!ok) {
    return { ok: false, reason: "sig_verify" };
  }
  return { ok: true, payload: payloadObj };
}

module.exports = { verifyLicenseKey, canonicalLicensePayload };
