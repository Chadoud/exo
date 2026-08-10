/**
 * Read-only admin support endpoints (product-admin allowlist only).
 *
 * Security posture (docs/SECURITY.md):
 * - Non-admins receive the same 404 body as an unknown route, so a stolen
 *   user token cannot even discover that this surface exists.
 * - Exact email match only — no wildcard or prefix search (no enumeration).
 * - Lookups are rate-limited per admin account and audit-logged with account
 *   ids only (emails never appear in logs).
 */

const express = require("express");
const { getProfile, findAccountByEmail } = require("../lib/accounts");
const { isAccountProductAdmin } = require("../lib/productAdmins");
const { requireAuth } = require("../middleware/requireAuth");
const { allow } = require("../lib/rateLimit");

const EMAIL_MAX_LENGTH = 255;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOOKUPS_PER_WINDOW = 30;
const LOOKUP_WINDOW_MS = 5 * 60 * 1000;

const router = express.Router();

async function requireProductAdmin(req, res, next) {
  try {
    if (await isAccountProductAdmin(req.accountId)) return next();
    return res.status(404).json({ detail: "Not found" });
  } catch (e) {
    console.error("[admin] admin check failed:", e?.message || e);
    return res.status(500).json({ detail: "admin_check_failed" });
  }
}

router.get("/admin/account-lookup", requireAuth, requireProductAdmin, async (req, res) => {
  if (!allow(`admin-lookup:${req.accountId}`, LOOKUPS_PER_WINDOW, LOOKUP_WINDOW_MS)) {
    return res.status(429).json({ detail: "rate_limited" });
  }
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!email || email.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(email)) {
    return res.status(422).json({ detail: "invalid_email" });
  }
  try {
    const account = await findAccountByEmail(email);
    console.log(
      `[admin] account lookup by=${req.accountId} target=${account ? account.id : "not_found"}`,
    );
    if (!account) {
      return res.status(404).json({ detail: "account_not_found" });
    }
    if (!account.is_active) {
      return res.json({ ok: true, account: { account_id: account.id, is_active: false } });
    }
    // getProfile is the canonical account view — the admin sees exactly what
    // the client entitlement path computes, plus the Stripe dashboard handle.
    const profile = await getProfile(account.id);
    return res.json({
      ok: true,
      account: {
        ...profile,
        is_active: true,
        stripe_customer_id: account.stripe_customer_id ?? null,
      },
    });
  } catch (e) {
    console.error("[admin] account lookup failed:", e?.message || e);
    return res.status(500).json({ detail: "lookup_failed" });
  }
});

module.exports = router;
