/**
 * exo://billing/complete | exo://billing/cancelled — the browser hands the user
 * back after Stripe Checkout / Customer Portal (via the cloud /v1/billing/done
 * handoff page; Stripe itself cannot redirect to custom schemes).
 *
 * On "complete" the cloud profile is re-synced immediately so the renderer's
 * next entitlement poll sees the subscription without waiting for the webhook
 * race to settle in the UI.
 */

const { app, BrowserWindow } = require("electron");

/**
 * Stripe's webhook usually lands a few seconds AFTER the browser redirects the
 * user back, so the first profile sync often races it. Re-sync on this
 * schedule until the cloud reports the subscription.
 */
const SUBSCRIPTION_SYNC_RETRY_DELAYS_MS = [3000, 5000, 8000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Re-sync the cloud profile; true when it reports an entitling subscription. */
async function syncProfileIsSubscribed() {
  const { syncTrialFromCloudSession } = require("./entitlement/store");
  const profile = await syncTrialFromCloudSession(app.getPath("userData"));
  return Boolean(profile?.subscription_active);
}

/**
 * @param {string} rawUrl
 * @returns {{ kind: "complete" | "cancelled" } | null}
 */
function parseBillingDeepLink(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "exo:" || url.hostname !== "billing") return null;
  if (url.pathname === "/complete") return { kind: "complete" };
  if (url.pathname === "/cancelled") return { kind: "cancelled" };
  return null;
}

/** @param {{ kind: string }} detail */
function broadcastBillingEvent(detail) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send("billing:event", detail);
    } catch {
      /* window may be closing */
    }
  }
}

/**
 * Route a protocol URL; returns true when it was a billing deep link.
 * @param {string} rawUrl
 * @param {{ showMainWindow?: () => void }} [opts]
 */
function handleBillingDeepLinkUrl(rawUrl, opts = {}) {
  const parsed = parseBillingDeepLink(rawUrl);
  if (!parsed) return false;

  opts.showMainWindow?.();

  if (parsed.kind === "complete") {
    void (async () => {
      let subscribed = false;
      try {
        subscribed = await syncProfileIsSubscribed();
      } catch (err) {
        console.warn("[billing] post-checkout profile sync failed:", err && err.message);
      }
      // Give immediate feedback either way; keep polling if the webhook hasn't
      // written the subscription yet and confirm with a follow-up event.
      broadcastBillingEvent({ kind: "complete", subscribed });
      if (subscribed) return;
      for (const delayMs of SUBSCRIPTION_SYNC_RETRY_DELAYS_MS) {
        await sleep(delayMs);
        try {
          if (await syncProfileIsSubscribed()) {
            broadcastBillingEvent({ kind: "entitled" });
            return;
          }
        } catch (err) {
          console.warn("[billing] post-checkout profile re-sync failed:", err && err.message);
        }
      }
      console.warn("[billing] subscription still not visible after checkout — webhook delayed or failing");
    })();
  } else {
    broadcastBillingEvent({ kind: "cancelled" });
  }
  return true;
}

module.exports = { parseBillingDeepLink, handleBillingDeepLinkUrl };
