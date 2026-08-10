const express = require("express");
const config = require("../lib/config");
const { POLICY_VERSION, MIN_SUPPORTED_CLIENT } = require("../lib/clientPolicy");
const google = require("../lib/oauthGoogle");
const apple = require("../lib/oauthApple");

const router = express.Router();

/** Lets the desktop app show only the sign-in providers this server has configured. */
router.get("/auth-config", (_req, res) => {
  res.json({
    providers: {
      password: true,
      google: google.isConfigured(),
      apple: apple.isConfigured(),
    },
  });
});

/** Desktop + web client policy (aligned with backend/telemetry/public_routes.py). */
router.get("/client-config", (_req, res) => {
  res.json({
    min_supported_client: MIN_SUPPORTED_CLIENT,
    policy_version: POLICY_VERSION,
    free_trial_days: config.freeTrialDays,
    telemetry_ingest_enabled: true,
    feedback_ingest_enabled: true,
    crash_reports_ingest_enabled: Boolean(config.crashIngestToken),
    billing: {
      enabled: config.stripe.enabled && Boolean(config.stripe.secretKey),
      // Display-only strings — actual charge amounts live in the Stripe prices.
      price_monthly: config.stripe.displayPriceMonthly,
      price_annual: config.stripe.displayPriceAnnual,
    },
  });
});

module.exports = router;
