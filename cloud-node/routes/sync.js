const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const {
  registerDevice,
  pushBlobs,
  pullBlobs,
  syncStatus,
  createPairingGrant,
  redeemPairingGrant,
} = require("../lib/syncRelay");

const router = express.Router();

router.get("/sync/status", requireAuth, async (req, res) => {
  try {
    return res.json(await syncStatus(req.accountId));
  } catch (e) {
    return res.status(500).json({ detail: e.message || "sync_status_failed" });
  }
});

router.post("/sync/devices/register", requireAuth, async (req, res) => {
  try {
    const name = String(req.body?.name || "Mobile").slice(0, 120);
    const platform = String(req.body?.platform || "ios").slice(0, 16);
    const pushToken = req.body?.push_token ? String(req.body.push_token).slice(0, 512) : null;
    const deviceId = req.body?.device_id ? String(req.body.device_id).slice(0, 36) : null;
    return res.json(await registerDevice(req.accountId, { name, platform, pushToken, deviceId }));
  } catch (e) {
    return res.status(500).json({ detail: e.message || "register_device_failed" });
  }
});

router.post("/sync/blobs/push", requireAuth, async (req, res) => {
  try {
    const blobs = Array.isArray(req.body?.blobs) ? req.body.blobs : [];
    if (blobs.length > 500) {
      return res.status(400).json({ detail: "too_many_blobs" });
    }
    const out = await pushBlobs(req.accountId, blobs);
    // Strict boundary when the whole batch is invalid; mixed batches stay 200 + rejected count.
    if (out.rejected > 0 && out.accepted === 0 && blobs.length > 0) {
      return res.status(422).json(out);
    }
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ detail: e.message || "push_failed" });
  }
});

router.get("/sync/blobs/pull", requireAuth, async (req, res) => {
  try {
    const cursor = Number.parseInt(String(req.query.cursor || "0"), 10) || 0;
    const limit = Math.min(Number.parseInt(String(req.query.limit || "200"), 10) || 200, 500);
    const snapshotOffset =
      Number.parseInt(String(req.query.snapshot_offset || "0"), 10) || 0;
    return res.json(await pullBlobs(req.accountId, cursor, limit, snapshotOffset));
  } catch (e) {
    return res.status(500).json({ detail: e.message || "pull_failed" });
  }
});

router.post("/sync/pairing/grants", requireAuth, async (req, res) => {
  try {
    const fp = String(req.body?.key_fingerprint || "").trim();
    if (!fp) return res.status(400).json({ detail: "key_fingerprint_required" });
    return res.json(await createPairingGrant(req.accountId, fp));
  } catch (e) {
    if (e.code === "key_fingerprint_required" || e.message === "key_fingerprint_required") {
      return res.status(400).json({ detail: "key_fingerprint_required" });
    }
    return res.status(500).json({ detail: e.message || "pairing_grant_failed" });
  }
});

router.post("/sync/pairing/redeem", requireAuth, async (req, res) => {
  try {
    const token = String(req.body?.grant_token || "").trim();
    const fp = String(req.body?.key_fingerprint || "").trim();
    if (!token) return res.status(400).json({ detail: "grant_token_required" });
    if (!fp) return res.status(400).json({ detail: "key_fingerprint_required" });
    const out = await redeemPairingGrant(req.accountId, token, fp);
    if (!out.ok) {
      const status =
        out.error === "account_mismatch" || out.error === "key_mismatch"
          ? 403
          : out.error === "expired"
            ? 410
            : 400;
      return res.status(status).json({ detail: out.error });
    }
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ detail: e.message || "pairing_redeem_failed" });
  }
});

module.exports = router;
