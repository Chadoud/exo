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
      try {
        const { syncTrialFromCloudSession } = require("./entitlement/store");
        await syncTrialFromCloudSession(app.getPath("userData"));
      } catch (err) {
        console.warn("[billing] post-checkout profile sync failed:", err && err.message);
      }
      broadcastBillingEvent({ kind: "complete" });
    })();
  } else {
    broadcastBillingEvent({ kind: "cancelled" });
  }
  return true;
}

module.exports = { parseBillingDeepLink, handleBillingDeepLinkUrl };
