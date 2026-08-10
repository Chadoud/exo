/** Stripe billing IPC — checkout/portal launch in system browser, public config. */

const { ipcMain, shell, app } = require("electron");
const cloudAuth = require("../cloudAuth");
const { isTrustedSender } = require("./senderGuard");

const CONFIG_CACHE_TTL_MS = 10 * 60 * 1000;

/** Server error codes forwarded verbatim to the renderer (all others collapse). */
const KNOWN_BILLING_ERRORS = new Set([
  "not_logged_in",
  "already_subscribed",
  "no_stripe_customer",
  "billing_not_configured",
  "invalid_interval",
  "rate_limited",
]);

/** @param {unknown} err */
function mapBillingError(err) {
  const message = err instanceof Error ? err.message.trim() : String(err);
  if (KNOWN_BILLING_ERRORS.has(message)) return message;
  if (
    err instanceof TypeError ||
    /fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(message)
  ) {
    return "offline";
  }
  return "billing_error";
}

/** Only Stripe-hosted https URLs returned by our own API may be opened. */
function isSafeBillingUrl(url) {
  return typeof url === "string" && /^https:\/\/[^/]*\.stripe\.com\//.test(url);
}

let configCache = null;
let configCacheAt = 0;

async function fetchBillingConfig() {
  if (configCache && Date.now() - configCacheAt < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  const base = cloudAuth.cloudBaseUrl();
  const res = await fetch(`${base}/v1/public/client-config`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  const billing = data?.billing || {};
  configCache = {
    enabled: Boolean(billing.enabled),
    priceMonthly: typeof billing.price_monthly === "string" ? billing.price_monthly : null,
    priceAnnual: typeof billing.price_annual === "string" ? billing.price_annual : null,
  };
  configCacheAt = Date.now();
  return configCache;
}

function registerBillingHandlers() {
  const ud = () => app.getPath("userData");

  ipcMain.handle("billing:checkout", async (event, interval) => {
    if (!isTrustedSender(event)) return { ok: false, error: "untrusted_sender" };
    if (interval !== "monthly" && interval !== "annual") {
      return { ok: false, error: "invalid_interval" };
    }
    try {
      const { checkout_url: checkoutUrl } = await cloudAuth.createBillingCheckoutSession(
        ud(),
        interval,
      );
      if (!isSafeBillingUrl(checkoutUrl)) {
        console.error("[billing] refused to open non-Stripe checkout URL");
        return { ok: false, error: "billing_error" };
      }
      await shell.openExternal(checkoutUrl);
      return { ok: true };
    } catch (err) {
      const code = mapBillingError(err);
      if (code === "billing_error") {
        console.error("[billing] checkout failed:", err instanceof Error ? err.message : err);
      }
      return { ok: false, error: code };
    }
  });

  ipcMain.handle("billing:openPortal", async (event) => {
    if (!isTrustedSender(event)) return { ok: false, error: "untrusted_sender" };
    try {
      const { portal_url: portalUrl } = await cloudAuth.createBillingPortalSession(ud());
      if (!isSafeBillingUrl(portalUrl)) {
        console.error("[billing] refused to open non-Stripe portal URL");
        return { ok: false, error: "billing_error" };
      }
      await shell.openExternal(portalUrl);
      return { ok: true };
    } catch (err) {
      const code = mapBillingError(err);
      if (code === "billing_error") {
        console.error("[billing] portal failed:", err instanceof Error ? err.message : err);
      }
      return { ok: false, error: code };
    }
  });

  ipcMain.handle("billing:getConfig", async (event) => {
    if (!isTrustedSender(event)) return { ok: false, error: "untrusted_sender" };
    try {
      const config = await fetchBillingConfig();
      return { ok: true, ...config };
    } catch (err) {
      return { ok: false, error: mapBillingError(err) };
    }
  });
}

module.exports = { registerBillingHandlers, mapBillingError, isSafeBillingUrl };
