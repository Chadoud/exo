/**
 * Stripe billing routes.
 *
 * Two routers because body parsing differs:
 * - createBillingRouter (mounted under /v1 after express.json): checkout/portal
 *   sessions (Bearer JWT; account id from the token, never the body) plus the
 *   https done/cancelled handoff pages (Stripe rejects exo:// URLs directly).
 * - createStripeWebhookRouter (mounted with express.raw BEFORE express.json):
 *   signature IS the auth. Always 200 for verified events we ignore; 500 only
 *   on genuine processing failure so Stripe retries exactly when we want.
 */

const express = require("express");
const config = require("../lib/config");
const { getPool } = require("../lib/db");
const { allow } = require("../lib/rateLimit");
const { clientIp } = require("../lib/clientIp");
const { requireAuth } = require("../middleware/requireAuth");
const { billingHandoffPageHtml } = require("../lib/oauthHandoffHtml");
const billing = require("../lib/stripeBilling");
const { processStripeEvent } = require("../lib/stripeWebhook");

const SESSION_RATE_MAX = 10;
const SESSION_RATE_WINDOW_MS = 10 * 60_000;
const WEBHOOK_RATE_MAX = 120;
const WEBHOOK_RATE_WINDOW_MS = 60_000;

/** Allowlisted error codes — raw Stripe/DB messages must never reach clients. */
const KNOWN_ERROR_CODES = new Set([
  "invalid_interval",
  "already_subscribed",
  "no_stripe_customer",
  "billing_not_configured",
  "invalid_token",
]);

/** @param {object} overrides test injection: { pool, stripe, expectLivemode, enabled } */
function resolveDeps(overrides) {
  return {
    pool: overrides.pool || getPool(),
    stripe: overrides.stripe || billing.getStripe(),
    // Derived from the configured key, NOT NODE_ENV: a production server may
    // intentionally run sandbox keys during rollout, and its test-mode events
    // must still be processed.
    expectLivemode:
      overrides.expectLivemode !== undefined ? overrides.expectLivemode : config.stripe.liveMode,
  };
}

/** Map internal errors to the fixed code list; log details server-side only. */
function sendBillingError(res, err, fallbackCode) {
  const status = err.status || 500;
  const code = KNOWN_ERROR_CODES.has(err.message) ? err.message : fallbackCode;
  if (status >= 500) {
    console.error(`[billing] ${fallbackCode}:`, err?.message || err);
  }
  return res.status(status).json({ detail: code });
}

/**
 * Checkout/portal sessions + browser handoff pages. Mount under /v1 (JSON body).
 * @param {object} [overrides]
 */
function createBillingRouter(overrides = {}) {
  const router = express.Router();
  const enabled = () =>
    overrides.enabled !== undefined ? overrides.enabled : billing.billingEnabled();

  router.post("/billing/checkout-session", requireAuth, async (req, res) => {
    if (!enabled()) {
      return res.status(503).json({ detail: "billing_not_configured" });
    }
    if (!allow(`billing-session:${req.accountId}`, SESSION_RATE_MAX, SESSION_RATE_WINDOW_MS)) {
      return res.status(429).json({ detail: "rate_limited" });
    }
    const interval = req.body?.interval;
    if (interval !== "monthly" && interval !== "annual") {
      return res.status(422).json({ detail: "invalid_interval" });
    }
    try {
      const result = await billing.createCheckoutSession(resolveDeps(overrides), req.accountId, interval);
      return res.json(result);
    } catch (err) {
      return sendBillingError(res, err, "checkout_session_failed");
    }
  });

  router.post("/billing/portal-session", requireAuth, async (req, res) => {
    if (!enabled()) {
      return res.status(503).json({ detail: "billing_not_configured" });
    }
    if (!allow(`billing-session:${req.accountId}`, SESSION_RATE_MAX, SESSION_RATE_WINDOW_MS)) {
      return res.status(429).json({ detail: "rate_limited" });
    }
    try {
      const result = await billing.createPortalSession(resolveDeps(overrides), req.accountId);
      return res.json(result);
    } catch (err) {
      return sendBillingError(res, err, "portal_session_failed");
    }
  });

  router.get("/billing/done", (req, res) => {
    const kind = String(req.query.from || "") === "portal" ? "portal" : "success";
    res.status(200).type("html").send(billingHandoffPageHtml({ kind }));
  });

  router.get("/billing/cancelled", (_req, res) => {
    res.status(200).type("html").send(billingHandoffPageHtml({ kind: "cancelled" }));
  });

  return router;
}

/**
 * Stripe webhook. Mount at /v1/webhooks/stripe with express.raw() so req.body
 * is the untouched Buffer the signature was computed over.
 * @param {object} [overrides]
 */
function createStripeWebhookRouter(overrides = {}) {
  const router = express.Router();
  const webhookSecret = () =>
    overrides.webhookSecret !== undefined ? overrides.webhookSecret : config.stripe.webhookSecret;

  router.post("/", async (req, res) => {
    if (!webhookSecret()) {
      return res.status(503).json({ ok: false, error: "webhook not configured" });
    }
    if (!allow(`stripe-webhook:${clientIp(req)}`, WEBHOOK_RATE_MAX, WEBHOOK_RATE_WINDOW_MS)) {
      return res.status(429).json({ ok: false, error: "rate limit" });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const signature = req.get("stripe-signature") || "";
    const deps = resolveDeps(overrides);

    let event;
    try {
      event = deps.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret());
    } catch {
      return res.status(401).json({ ok: false, error: "invalid signature" });
    }
    if (!event || !event.id || !event.type) {
      return res.status(422).json({ ok: false, error: "invalid payload" });
    }

    try {
      const result = await processStripeEvent(deps, event);
      return res.status(200).json(result);
    } catch (err) {
      // Non-2xx on genuine failure — the transaction rolled back, Stripe retries.
      console.error("[billing] webhook processing failed:", err?.message || err);
      return res.status(500).json({ ok: false, error: "processing failed" });
    }
  });

  return router;
}

module.exports = { createBillingRouter, createStripeWebhookRouter };
