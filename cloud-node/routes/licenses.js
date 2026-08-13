const express = require("express");
const { verifyLicenseKey } = require("../lib/licenseVerify");
const { activateDevice } = require("../lib/licenseActivations");
const { authRateLimitMiddleware } = require("../lib/authRateLimit");

const router = express.Router();

const MACHINE_ID_RE = /^[0-9a-f]{64}$/i;

function httpError(res, status, detail) {
  return res.status(status).json({ detail });
}

/**
 * First-use device binding for offline license keys (see tools/license-keygen).
 * Unauthenticated by design — the signed key itself is the credential, same as
 * the desktop app's own offline verification. No account/session required.
 */
router.post("/licenses/activate", authRateLimitMiddleware("license_activate"), async (req, res) => {
  try {
    const licenseKey = String(req.body?.license_key || "");
    const machineId = String(req.body?.machine_id || "").toLowerCase();
    if (!MACHINE_ID_RE.test(machineId)) {
      return httpError(res, 422, "machine_id must be a 64-char hex fingerprint");
    }
    const verified = await verifyLicenseKey(licenseKey);
    if (!verified.ok) {
      return httpError(res, 400, `invalid_license:${verified.reason}`);
    }
    const { license_id: licenseId, max_seats: maxSeats } = verified.payload;
    const activation = await activateDevice(licenseId, machineId, maxSeats);
    if (!activation.ok) {
      return httpError(res, 409, activation.reason);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("[licenses] activate failed:", e.message, e.stack || "");
    return httpError(res, 500, "Could not activate license");
  }
});

module.exports = router;
