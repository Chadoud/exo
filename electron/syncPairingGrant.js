/**
 * In-memory pairing-grant reuse so QR and clipboard share one token,
 * and so Strict Mode / rapid focus does not mint a new grant every time.
 */

const PAIRING_DEBOUNCE_MS = 60 * 1000;
const PAIRING_EXPIRY_SKEW_MS = 90 * 1000;

/**
 * @param {unknown} value
 * @returns {number}
 */
function parseIsoMs(value) {
  if (!value) return 0;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * @param {{ payload?: object, expiresAtMs?: number, issuedAtMs?: number } | null} cache
 * @param {{ now?: number, force?: boolean, masterKeyB64?: string, accountId?: string }} [opts]
 */
function canReusePairingGrant(cache, opts = {}) {
  const now = typeof opts.now === "number" ? opts.now : Date.now();
  const payload = cache?.payload;
  if (!payload || typeof payload !== "object") return false;
  if (opts.masterKeyB64 && payload.master_key_b64 !== opts.masterKeyB64) return false;
  if (opts.accountId && payload.account_id !== opts.accountId) return false;
  const expiresAtMs = cache.expiresAtMs || parseIsoMs(payload.expires_at);
  if (!expiresAtMs || expiresAtMs - now <= PAIRING_EXPIRY_SKEW_MS) return false;
  if (opts.force) {
    const issuedAtMs = cache.issuedAtMs || parseIsoMs(payload.issued_at);
    return issuedAtMs > 0 && now - issuedAtMs < PAIRING_DEBOUNCE_MS;
  }
  return true;
}

/**
 * @param {object} payload
 * @param {number} [now]
 */
function rememberPairingGrant(payload, now = Date.now()) {
  return {
    payload,
    expiresAtMs: parseIsoMs(payload.expires_at),
    issuedAtMs: parseIsoMs(payload.issued_at) || now,
  };
}

module.exports = {
  PAIRING_DEBOUNCE_MS,
  PAIRING_EXPIRY_SKEW_MS,
  canReusePairingGrant,
  rememberPairingGrant,
};
