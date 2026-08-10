require("dotenv").config();

const express = require("express");
const cors = require("cors");
const config = require("./lib/config");
const { getSortLlmRuntimeConfig } = require("./lib/sortLlmRuntimeConfig");
const { getPool } = require("./lib/db");
const { syncRelayTablesReady, productAnalyticsReady, whatsappWebhookReady } = require("./lib/dbSchema");
const authRouter = require("./routes/auth");
const authSocialRouter = require("./routes/authSocial");
const meRouter = require("./routes/me");
const crashRouter = require("./routes/crash");
const telemetryRouter = require("./routes/telemetry");
const publicConfigRouter = require("./routes/publicConfig");
const syncRouter = require("./routes/sync");
const sortCredentialsRouter = require("./routes/sortCredentials");
const whatsappWebhookRouter = require("./routes/whatsappWebhook");
const { createBillingRouter, createStripeWebhookRouter } = require("./routes/billing");
const { startSubscriptionReconciliation } = require("./lib/reconcileSubscriptions");
const adminRouter = require("./routes/admin");
const whatsappMeRouter = require("./routes/whatsappMe");
const { router: whatsappOAuthCallbackRouter } = require("./routes/whatsappOAuthCallback");
const { metricsMiddleware, prometheusText } = require("./lib/metrics");

const nodeEnv = process.env.NODE_ENV || "development";

/** Apple/Google POST or redirect back to auth callback routes — must not hit cors_not_allowed. */
const OAUTH_CALLBACK_ORIGINS = new Set([
  "https://appleid.apple.com",
  "https://idmsa.apple.com",
  "https://accounts.google.com",
  "https://account.google.com",
]);

function parseCorsOrigins() {
  const raw = (process.env.CORS_ALLOWED_ORIGINS || "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return ["https://exosites.ch", "https://www.exosites.ch"];
}

const allowedCorsOrigins = parseCorsOrigins();

/**
 * @param {string | undefined} origin
 * @returns {boolean}
 */
function isCorsOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedCorsOrigins.includes(origin)) return true;
  if (OAUTH_CALLBACK_ORIGINS.has(origin)) return true;
  const apiOrigin = config.appBaseUrl.replace(/\/$/, "");
  if (origin === apiOrigin) return true;
  if (
    nodeEnv !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
  ) {
    return true;
  }
  return false;
}

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      // Never throw — callback(Error) becomes a 500. OAuth callbacks send provider Origin headers.
      if (isCorsOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  }),
);

// Meta webhook signature verification requires the raw body.
app.use(
  "/v1/webhooks/whatsapp",
  express.raw({ type: "application/json", limit: "512kb" }),
  whatsappWebhookRouter,
);

// Stripe webhook signature verification requires the raw body.
app.use(
  "/v1/webhooks/stripe",
  express.raw({ type: "application/json", limit: "512kb" }),
  createStripeWebhookRouter(),
);

app.use(express.json({ limit: "256kb" }));
app.use(metricsMiddleware);

const google = require("./lib/oauthGoogle");
const apple = require("./lib/oauthApple");

app.get("/health", async (_req, res) => {
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    const sortLlm = getSortLlmRuntimeConfig();
    return res.json({
      ok: true,
      service: "exo-cloud-api",
      version: process.env.npm_package_version || "1.0.0",
      features: {
        social_auth: Boolean(google.isConfigured() || apple.isConfigured()),
        sync_relay: await syncRelayTablesReady(pool),
        product_analytics: await productAnalyticsReady(pool),
        whatsapp_webhooks: await whatsappWebhookReady(pool),
        billing: config.stripe.enabled && Boolean(config.stripe.secretKey),
        sort_credentials: Boolean(
          sortLlm.mockToken || sortLlm.masterKey || sortLlm.allowMasterDelegation,
        ),
        sort_credentials_mode: sortLlm.mockToken
          ? "mock"
          : sortLlm.allowMasterDelegation
            ? "delegation"
            : sortLlm.masterKey
              ? "virtual"
              : "off",
      },
    });
  } catch (e) {
    return res.status(503).json({ ok: false, error: e.message });
  }
});

app.get("/metrics", (_req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(prometheusText());
});

app.use("/auth", authRouter);
app.use("/auth", authSocialRouter);
app.use("/v1", meRouter);
app.use("/v1", crashRouter);
app.use("/v1", telemetryRouter);
app.use("/v1", syncRouter);
app.use("/v1", sortCredentialsRouter);
app.use("/v1", whatsappMeRouter);
app.use("/v1", whatsappOAuthCallbackRouter);
app.use("/v1", createBillingRouter());
app.use("/v1", adminRouter);
app.use("/v1/public", publicConfigRouter);

app.use((_req, res) => {
  res.status(404).json({ detail: "Not found" });
});

app.listen(config.port, () => {
  console.log(`[exo-cloud-api] listening on port ${config.port}`);
  // Nightly self-heal for missed Stripe webhooks (billing runbook).
  startSubscriptionReconciliation();
});
