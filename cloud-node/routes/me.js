const express = require("express");
const { getProfile } = require("../lib/accounts");
const { updateProfile } = require("../lib/userProfile");
const { exportAccountData, deleteAccount } = require("../lib/accountLifecycle");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.accountId);
    if (!profile) {
      return res.status(401).json({ detail: "invalid_token" });
    }
    return res.json(profile);
  } catch (e) {
    return res.status(500).json({ detail: e.message || "Failed to load profile" });
  }
});

router.patch("/me", requireAuth, async (req, res) => {
  try {
    await updateProfile(req.accountId, req.body || {});
    const profile = await getProfile(req.accountId);
    if (!profile) {
      return res.status(401).json({ detail: "invalid_token" });
    }
    return res.json(profile);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) {
      console.error("[me] profile patch failed:", e?.message || e);
    }
    return res.status(status).json({ detail: e.message || "profile_update_failed" });
  }
});

router.get("/me/data-export", requireAuth, async (req, res) => {
  try {
    return res.json(await exportAccountData(req.accountId));
  } catch (e) {
    const status = e.status || 500;
    return res.status(status).json({ detail: e.message || "export_failed" });
  }
});

router.delete("/me", requireAuth, async (req, res) => {
  try {
    const profile = await getProfile(req.accountId);
    if (!profile) {
      return res.status(404).json({ detail: "account_not_found" });
    }
    await deleteAccount(req.accountId);
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ detail: e.message || "delete_failed" });
  }
});

module.exports = router;
