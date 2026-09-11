/**
 * Store provider webhooks. Auth is the provider signature / OIDC token.
 * Acquisition (STORE_BILLING_ENABLED) may be off; lifecycle still ingest.
 */

const express = require("express");
const { allow } = require("../lib/rateLimit");
const { clientIp } = require("../lib/clientIp");
const { processAppleNotification, processPlayNotification } = require("../lib/storeWebhook");

const WEBHOOK_RATE_MAX = 120;
const WEBHOOK_RATE_WINDOW_MS = 60_000;

function sendStoreWebhookError(res, err) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error("[billing] store webhook processing failed:", err?.message || err);
  }
  const client = status === 401 ? "invalid signature" : status === 422 ? "invalid payload" : "processing failed";
  return res.status(status).json({ ok: false, error: client });
}

/** @param {object} [overrides] */
function createAppleWebhookRouter(overrides = {}) {
  const router = express.Router();
  router.post("/", async (req, res) => {
    if (!allow(`apple-webhook:${clientIp(req)}`, WEBHOOK_RATE_MAX, WEBHOOK_RATE_WINDOW_MS)) {
      return res.status(429).json({ ok: false, error: "rate limit" });
    }
    try {
      const result = await processAppleNotification(overrides, req.body || {});
      return res.status(200).json(result);
    } catch (err) {
      return sendStoreWebhookError(res, err);
    }
  });
  return router;
}

/** @param {object} [overrides] */
function createPlayWebhookRouter(overrides = {}) {
  const router = express.Router();
  router.post("/", async (req, res) => {
    if (!allow(`play-webhook:${clientIp(req)}`, WEBHOOK_RATE_MAX, WEBHOOK_RATE_WINDOW_MS)) {
      return res.status(429).json({ ok: false, error: "rate limit" });
    }
    try {
      const result = await processPlayNotification(
        overrides,
        req.body || {},
        req.get("authorization") || "",
      );
      return res.status(200).json(result);
    } catch (err) {
      return sendStoreWebhookError(res, err);
    }
  });
  return router;
}

module.exports = { createAppleWebhookRouter, createPlayWebhookRouter };
