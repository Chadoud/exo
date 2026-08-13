/**
 * Branded HTML for cloud OAuth handoff (/auth/done). Matches electron/oauthCallbackHtml dark theme.
 *
 * Browsers block automatic exo:// navigation without a user click ("user gesture required").
 * Desktop Exo intercepts /auth/done and closes its own sign-in window; this page is for
 * system-browser fallback only. window.close() is blocked in Chrome for OAuth tabs.
 */
const APP_NAME = "Exo";

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SUCCESS_ICON = `<svg class="icon icon--ok" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
  <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35"/>
  <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M14 24l7 7 13-14"/>
</svg>`;

const ERROR_ICON = `<svg class="icon icon--err" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
  <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35"/>
  <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M17 17l14 14M31 17L17 31"/>
</svg>`;

/** Neutral (pre-action) state — e.g. a form awaiting input, nothing succeeded or failed yet. */
const NEUTRAL_ICON = `<svg class="icon icon--neutral" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
  <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2" opacity="0.35"/>
  <rect x="16" y="22" width="16" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/>
  <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M19 22v-4a5 5 0 0 1 10 0v4"/>
</svg>`;

function openAppButton(deepLink, label) {
  const safeLink = escapeHtml(deepLink);
  const safeLabel = escapeHtml(label);
  return `<button type="button" class="cta-btn" data-deep-link="${safeLink}" id="open-exo-btn">${safeLabel}</button>
<p class="close-hint hidden" id="open-exo-close-hint">Exo should open on your Mac. You can close this tab.</p>
<script>
(function () {
  var btn = document.getElementById("open-exo-btn");
  var hint = document.getElementById("open-exo-close-hint");
  if (!btn) return;
  btn.addEventListener("click", function () {
    var link = btn.getAttribute("data-deep-link");
    if (link) window.location.href = link;
    window.setTimeout(function () {
      window.close();
      if (hint) hint.classList.remove("hidden");
    }, 400);
  });
})();
</script>`;
}

const VARIANT_PRESENTATION = {
  success: { icon: SUCCESS_ICON, iconClass: "icon-wrap icon-wrap--ok" },
  error: { icon: ERROR_ICON, iconClass: "icon-wrap icon-wrap--err" },
  neutral: { icon: NEUTRAL_ICON, iconClass: "icon-wrap icon-wrap--neutral" },
};

/**
 * Shared browser-side JSON-POST helper for hosted auth pages (forgot
 * password, reset password, verify email). Each page's own inline <script>
 * calls `postJson(url, payload)` instead of repeating the
 * fetch → parse-body → { ok, body } boilerplate for every submit handler.
 */
const POST_JSON_HELPER_SCRIPT = `<script>
function postJson(url, payload) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(function (res) {
    return res.json().then(function (body) { return { ok: res.ok, body: body }; });
  });
}
</script>`;

function brandedShell({ variant, headline, bodyHtml, footerHtml = "" }) {
  const { icon, iconClass } = VARIANT_PRESENTATION[variant] || VARIANT_PRESENTATION.success;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="dark"/>
  <title>${escapeHtml(headline)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --accent: #6c63ff;
      --accent-hover: #5a52e0;
      --text: #e8eaf6;
      --muted: #8b8fa8;
      --border: #2e3248;
      --success: #4caf7d;
      --error: #ef5350;
    }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    .bg-glow {
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(ellipse 85% 55% at 50% -15%, rgba(108, 99, 255, 0.2), transparent 55%),
        radial-gradient(ellipse 50% 35% at 100% 100%, rgba(76, 175, 125, 0.09), transparent 50%);
    }
    .card {
      position: relative;
      max-width: 420px;
      width: 100%;
      padding: 40px 36px 36px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow:
        0 24px 56px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.04) inset;
      text-align: center;
    }
    .icon-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      margin: 0 auto 20px;
      border-radius: 50%;
    }
    .icon-wrap--ok { color: var(--success); background: rgba(76, 175, 125, 0.12); }
    .icon-wrap--err { color: var(--error); background: rgba(239, 83, 80, 0.12); }
    .icon-wrap--neutral { color: var(--accent); background: rgba(108, 99, 255, 0.12); }
    .icon { display: block; }
    h1 {
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.3;
      margin-bottom: 12px;
    }
    p {
      font-size: 0.95rem;
      line-height: 1.55;
      color: var(--muted);
    }
    .cta-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-top: 20px;
      min-height: 2.75rem;
      padding: 0.65rem 1.5rem;
      border: none;
      border-radius: 12px;
      background: var(--accent);
      color: #fff;
      font-family: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(108, 99, 255, 0.35);
    }
    .cta-btn:hover { background: var(--accent-hover); }
    .cta-btn:focus-visible {
      outline: 2px solid rgba(108, 99, 255, 0.55);
      outline-offset: 3px;
    }
    .close-hint {
      margin-top: 14px;
      font-size: 0.85rem;
      line-height: 1.45;
      color: var(--muted);
    }
    .close-hint.hidden {
      display: none;
    }
    .brand {
      margin-top: 28px;
      padding-top: 22px;
      border-top: 1px solid var(--border);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: var(--accent);
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="bg-glow" aria-hidden="true"></div>
  <main class="card" role="status">
    <div class="${iconClass}">${icon}</div>
    <h1>${escapeHtml(headline)}</h1>
    ${bodyHtml}
    ${footerHtml}
    <p class="brand">${escapeHtml(APP_NAME)}</p>
  </main>
</body>
</html>`;
}

/** User-facing copy for known OAuth error codes. */
const ERROR_COPY = {
  signin_failed: "Something went wrong finishing sign-in. Close this tab and try again from the app.",
  server_setup: "Sign-in is not fully configured on the server yet. Try again later or use email sign-in.",
  offline: "Could not reach the sign-in server. Check your internet and try again.",
  invalid_state: "This sign-in link expired or was already used. Start again from the app.",
  no_code: "Google did not return an authorization code. Close this tab and try again.",
  cancelled: "Sign-in was cancelled. You can close this tab.",
};

/**
 * HTML for /auth/done — user taps a button to open exo:// (required by modern browsers).
 * @param {{ deepLink: string; error?: string }} opts
 */
function oauthHandoffPageHtml({ deepLink, error = "" }) {
  const isError = Boolean(error);
  if (isError) {
    const subline = ERROR_COPY[error] || ERROR_COPY.signin_failed;
    const bodyHtml = `<p>${escapeHtml(subline)}</p>`;
    const footerHtml = openAppButton(deepLink, `Return to ${APP_NAME}`);
    return brandedShell({
      variant: "error",
      headline: "Sign-in didn't finish",
      bodyHtml,
      footerHtml,
    });
  }

  const bodyHtml = `<p>${escapeHtml(`One more step — open ${APP_NAME} on your Mac to finish signing in.`)}</p>`;
  const footerHtml = openAppButton(deepLink, `Open ${APP_NAME}`);
  return brandedShell({
    variant: "success",
    headline: "You're signed in",
    bodyHtml,
    footerHtml,
  });
}

/**
 * HTML for /v1/billing/done and /v1/billing/cancelled — Stripe Checkout/Portal
 * cannot redirect to exo:// directly (https-only), so this page hands off.
 * @param {{ kind: "success" | "cancelled" | "portal" }} opts
 */
function billingHandoffPageHtml({ kind }) {
  if (kind === "cancelled") {
    return brandedShell({
      variant: "error",
      headline: "Checkout not completed",
      bodyHtml: `<p>No payment was made. You can close this tab and subscribe any time from ${escapeHtml(APP_NAME)}.</p>`,
      footerHtml: openAppButton("exo://billing/cancelled", `Return to ${APP_NAME}`),
    });
  }
  const headline = kind === "portal" ? "Billing updated" : "You're subscribed";
  const body =
    kind === "portal"
      ? `Any billing changes are saved. Open ${APP_NAME} to continue.`
      : `Payment received — open ${APP_NAME} to unlock full access.`;
  return brandedShell({
    variant: "success",
    headline,
    bodyHtml: `<p>${escapeHtml(body)}</p>`,
    footerHtml: openAppButton("exo://billing/complete", `Open ${APP_NAME}`),
  });
}

module.exports = {
  oauthHandoffPageHtml,
  billingHandoffPageHtml,
  escapeHtml,
  ERROR_COPY,
  // Shared dark-theme card shell — reused by passwordResetPagesHtml.js so every
  // hosted auth page (OAuth handoff, billing, password reset) looks the same.
  brandedShell,
  openAppButton,
  POST_JSON_HELPER_SCRIPT,
};
