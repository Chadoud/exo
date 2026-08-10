/**
 * Admin support endpoints (product-admin allowlist only).
 *
 * Security posture (docs/SECURITY.md):
 * - Non-admins receive the same 404 body as an unknown route, so a stolen
 *   user token cannot even discover that this surface exists.
 * - Lookup: exact email match only — no wildcard or prefix search.
 * - Mutations: bounded relative inputs only (never absolute dates), stricter
 *   rate limit, and an admin_audit row in the same transaction as the change.
 * - Logs and audit rows carry account ids, never emails.
 */

const express = require("express");
const { getPool } = require("../lib/db");
const { getProfile, findAccountByEmail } = require("../lib/accounts");
const { extendTrial, resyncSubscription } = require("../lib/adminActions");
const { getStripe } = require("../lib/stripeBilling");
const { isAccountProductAdmin } = require("../lib/productAdmins");
const { requireAuth } = require("../middleware/requireAuth");
const { allow } = require("../lib/rateLimit");

const EMAIL_MAX_LENGTH = 255;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_ID_MAX_LENGTH = 64;
const LOOKUPS_PER_WINDOW = 30;
const ACTIONS_PER_WINDOW = 10;
const WINDOW_MS = 5 * 60 * 1000;

async function requireProductAdmin(req, res, next) {
  try {
    if (await isAccountProductAdmin(req.accountId)) return next();
    return res.status(404).json({ detail: "Not found" });
  } catch (e) {
    console.error("[admin] admin check failed:", e?.message || e);
    return res.status(500).json({ detail: "admin_check_failed" });
  }
}

function validTargetAccountId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= ACCOUNT_ID_MAX_LENGTH;
}

/**
 * @param {{ stripe?: object }} [overrides] test injection points
 */
function createAdminRouter(overrides = {}) {
  const resolveStripe = () => overrides.stripe ?? getStripe();
  const router = express.Router();

  router.get("/admin/account-lookup", requireAuth, requireProductAdmin, async (req, res) => {
    if (!allow(`admin-lookup:${req.accountId}`, LOOKUPS_PER_WINDOW, WINDOW_MS)) {
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

  router.post(
    "/admin/accounts/:accountId/extend-trial",
    requireAuth,
    requireProductAdmin,
    async (req, res) => {
      if (!allow(`admin-action:${req.accountId}`, ACTIONS_PER_WINDOW, WINDOW_MS)) {
        return res.status(429).json({ detail: "rate_limited" });
      }
      const targetAccountId = req.params.accountId;
      if (!validTargetAccountId(targetAccountId)) {
        return res.status(422).json({ detail: "invalid_account" });
      }
      try {
        const result = await extendTrial(getPool(), {
          adminAccountId: req.accountId,
          targetAccountId,
          days: req.body?.days,
        });
        console.log(
          `[admin] extend_trial by=${req.accountId} target=${targetAccountId} ok=${result.ok}`,
        );
        if (!result.ok) {
          return res.status(result.error === "account_not_found" ? 404 : 422).json({ detail: result.error });
        }
        return res.json(result);
      } catch (e) {
        console.error("[admin] extend_trial failed:", e?.message || e);
        return res.status(500).json({ detail: "action_failed" });
      }
    },
  );

  router.post(
    "/admin/accounts/:accountId/resync-subscription",
    requireAuth,
    requireProductAdmin,
    async (req, res) => {
      if (!allow(`admin-action:${req.accountId}`, ACTIONS_PER_WINDOW, WINDOW_MS)) {
        return res.status(429).json({ detail: "rate_limited" });
      }
      const targetAccountId = req.params.accountId;
      if (!validTargetAccountId(targetAccountId)) {
        return res.status(422).json({ detail: "invalid_account" });
      }
      let stripe;
      try {
        stripe = resolveStripe();
      } catch {
        return res.status(503).json({ detail: "billing_not_configured" });
      }
      try {
        const result = await resyncSubscription(getPool(), stripe, {
          adminAccountId: req.accountId,
          targetAccountId,
        });
        console.log(
          `[admin] resync_subscription by=${req.accountId} target=${targetAccountId} subs=${result.subscriptions.length}`,
        );
        return res.json(result);
      } catch (e) {
        console.error("[admin] resync_subscription failed:", e?.message || e);
        return res.status(500).json({ detail: "action_failed" });
      }
    },
  );

  return router;
}

module.exports = { createAdminRouter };
