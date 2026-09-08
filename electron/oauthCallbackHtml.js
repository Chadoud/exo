/**
 * Branded HTML for OAuth loopback success pages (matches setup / app dark theme).
 * Keep in sync with ``APP_NAME`` in ``electron/constants.js`` (avoid requiring Electron here — unit tests load this from plain Node).
 */
const APP_NAME = require("../package.json").build?.productName ?? "Exo";

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

function brandedShell({ variant, headline, bodyHtml }) {
  const icon = variant === "error" ? ERROR_ICON : SUCCESS_ICON;
  const iconClass = variant === "error" ? "icon-wrap icon-wrap--err" : "icon-wrap icon-wrap--ok";
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
      --bg: #0f0b2e;
      --surface: color-mix(in srgb, #0f0b2e 88%, #2a2554 12%);
      --accent: color-mix(in srgb, #ffffff 62%, #0f0b2e 38%);
      --accent-hover: #2a2554;
      --text: #eef2ff;
      --muted: color-mix(in srgb, #eef2ff 55%, #2a2554 45%);
      --border: color-mix(in srgb, #2a2554 70%, #0f0b2e 30%);
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
    .icon-wrap--ok {
      color: var(--success);
      background: rgba(76, 175, 125, 0.12);
    }
    .icon-wrap--err {
      color: var(--error);
      background: rgba(239, 83, 80, 0.12);
    }
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
    .brand {
      margin-top: 28px;
      padding-top: 22px;
      border-top: 1px solid var(--border);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
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
    <p class="brand">${escapeHtml(APP_NAME)}</p>
  </main>
</body>
</html>`;
}

/**
 * @param {{ headline?: string, subline?: string }} [opts]
 */
function oauthLoopbackSuccessHtml(opts = {}) {
  const headline = opts.headline ?? "You're connected";
  const subline =
    opts.subline ?? `You can close this tab and return to ${APP_NAME}.`;
  const bodyHtml = `<p>${escapeHtml(subline)}</p>`;
  return brandedShell({ variant: "success", headline, bodyHtml });
}

/**
 * @param {{ headline?: string, subline?: string }} [opts]
 */
function oauthLoopbackErrorHtml(opts = {}) {
  const headline = opts.headline ?? "Sign-in didn't finish";
  const subline = opts.subline ?? "You can close this tab and try again from the app.";
  const bodyHtml = `<p>${escapeHtml(subline)}</p>`;
  return brandedShell({ variant: "error", headline, bodyHtml });
}

module.exports = {
  oauthLoopbackSuccessHtml,
  oauthLoopbackErrorHtml,
  escapeHtml,
};
