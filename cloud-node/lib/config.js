/** @typedef {{ sub: string; token_use: string; iat: number; exp: number }} JwtPayload */

/**
 * @param {string} name
 * @param {string | undefined} fallback
 */
function env(name, fallback = "") {
  const v = process.env[name];
  return v !== undefined && String(v).trim() !== "" ? String(v).trim() : fallback;
}

function envInt(name, fallback) {
  const n = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(n) ? n : fallback;
}

const appBaseUrl = env("APP_BASE_URL", "https://api.exosites.ch").replace(/\/$/, "");
const jwtSecretRaw = env("JWT_SECRET", "dev-change-me");
const nodeEnv = env("NODE_ENV", "development");

const stripeSecretKey = env("STRIPE_SECRET_KEY");
const stripeWebhookSecret = env("STRIPE_WEBHOOK_SECRET");

if (nodeEnv === "production") {
  if (!jwtSecretRaw || jwtSecretRaw === "dev-change-me" || jwtSecretRaw.length < 32) {
    console.error("[config] JWT_SECRET must be set to a strong value (32+ chars) in production");
    process.exit(1);
  }
  if (env("SORT_LLM_ALLOW_MASTER_DELEGATION", "0") === "1") {
    console.error(
      "[config] SORT_LLM_ALLOW_MASTER_DELEGATION=1 is forbidden in production — use virtual LiteLLM keys only",
    );
    process.exit(1);
  }
  if (stripeSecretKey && !stripeWebhookSecret) {
    console.error(
      "[config] STRIPE_SECRET_KEY is set without STRIPE_WEBHOOK_SECRET — refusing to run billing without webhook verification",
    );
    process.exit(1);
  }
  if (stripeSecretKey.startsWith("sk_test_")) {
    console.warn("[config] WARNING: STRIPE_SECRET_KEY is a test-mode key in production");
  }
}

const jwtSecret = jwtSecretRaw;

module.exports = {
  port: envInt("PORT", 3000),
  appBaseUrl,
  db: {
    host: env("DB_HOST", "localhost"),
    port: envInt("DB_PORT", 3306),
    user: env("DB_USER"),
    password: env("DB_PASSWORD"),
    database: env("DB_NAME", "exo_cloud"),
  },
  jwtSecret,
  accessMinutes: envInt("JWT_ACCESS_MINUTES", 60),
  refreshDays: envInt("JWT_REFRESH_DAYS", 30),
  freeTrialDays: envInt("FREE_TRIAL_DAYS", 30),
  /** @deprecated Byte wallet no longer gates access. */
  freeSortBytes: envInt("FREE_SORT_BYTES", 0),
  // Shared secret the desktop app sends in X-Crash-Token to write crash reports.
  // Empty disables the crash ingest endpoint.
  crashIngestToken: env("CRASH_INGEST_TOKEN"),

  // ─── Social sign-in (OAuth / OIDC) ───────────────────────────────────────
  // State JWT signing falls back to JWT_SECRET when AUTH_STATE_SECRET is unset.
  authStateSecret: env("AUTH_STATE_SECRET", jwtSecret),
  // Lifetime of the one-time code handed to the desktop after social sign-in.
  exchangeCodeTtlSeconds: envInt("AUTH_EXCHANGE_CODE_TTL", 120),
  google: {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    redirectUri: env("GOOGLE_REDIRECT_URI", `${appBaseUrl}/auth/google/callback`),
  },
  apple: {
    // Services ID (not the app bundle id).
    clientId: env("APPLE_CLIENT_ID"),
    teamId: env("APPLE_TEAM_ID"),
    keyId: env("APPLE_KEY_ID"),
    // Contents of the .p8 key. Newlines may be encoded as literal "\n".
    privateKey: env("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    redirectUri: env("APPLE_REDIRECT_URI", `${appBaseUrl}/auth/apple/callback`),
  },

  // ─── Cloud sort LLM (LiteLLM gateway) ───────────────────────────────────────
  sortLlm: {
    baseUrl: env("SORT_LLM_BASE_URL", "https://llm-staging.exosites.ch"),
    masterKey: env("LITELLM_MASTER_KEY"),
    tokenTtlSeconds: envInt("SORT_LLM_TOKEN_TTL_SECONDS", 86_400),
    maxParallelRequests: envInt("SORT_LLM_MAX_PARALLEL", 2),
    models: env("SORT_LLM_MODELS", "mistral,nomic-embed-text,moondream")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    /** Staging-only: return master key to entitled clients when /key/generate is unavailable. */
    allowMasterDelegation: env("SORT_LLM_ALLOW_MASTER_DELEGATION", "0") === "1",
    /** Local/tests: fixed token without calling LiteLLM. */
    mockToken: env("SORT_LLM_MOCK_TOKEN"),
  },

  // ─── Stripe billing (single Pro plan, CHF) ─────────────────────────────────
  stripe: {
    /** Master rollout switch — off keeps /v1/billing/* returning 503. */
    enabled: env("STRIPE_BILLING_ENABLED", "0") === "1",
    secretKey: stripeSecretKey,
    webhookSecret: stripeWebhookSecret,
    priceIdMonthly: env("STRIPE_PRICE_ID_MONTHLY"),
    priceIdAnnual: env("STRIPE_PRICE_ID_ANNUAL"),
    /** Stripe Tax at Checkout (Swiss VAT) — requires tax registration in the dashboard. */
    automaticTax: env("STRIPE_AUTOMATIC_TAX", "1") === "1",
    /** Display-only price strings served to clients (never used for charging). */
    displayPriceMonthly: env("STRIPE_DISPLAY_PRICE_MONTHLY", "CHF 20"),
    displayPriceAnnual: env("STRIPE_DISPLAY_PRICE_ANNUAL", "CHF 200"),
  },

  whatsapp: {
    appSecret: env("WHATSAPP_APP_SECRET"),
    verifyToken: env("WHATSAPP_VERIFY_TOKEN"),
    eventRetentionDays: envInt("WHATSAPP_EVENT_RETENTION_DAYS", 30),
    metaAppId: env("META_APP_ID"),
    metaAppSecret: env("META_APP_SECRET"),
    embeddedSignupConfigId: env("WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID"),
  },
};
