const express = require("express");
const config = require("../lib/config");
const { brandedShell, escapeHtml } = require("../lib/oauthHandoffHtml");

const router = express.Router();

/** Public HTTPS redirect URI for Meta WhatsApp Embedded Signup (desktop + web). */
function embeddedSignupRedirectUri() {
  return `${config.appBaseUrl}/v1/oauth/whatsapp-embedded-signup/callback`;
}

/**
 * Meta redirects here after Embedded Signup when a redirect_uri is used.
 * Electron's signup window also lands here; the preload + main process read ?code=.
 */
router.get("/oauth/whatsapp-embedded-signup/callback", (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const error = typeof req.query.error === "string" ? req.query.error.trim() : "";
  const errorDescription =
    typeof req.query.error_description === "string" ? req.query.error_description.trim() : "";

  res.set("Content-Type", "text/html; charset=utf-8");
  if (error) {
    res.status(400).send(
      brandedShell({
        variant: "error",
        headline: "Meta connect failed",
        bodyHtml: `<p>${escapeHtml(errorDescription || error)}</p>
<p>You can close this window and try again in Exo.</p>`,
      }),
    );
    return;
  }

  const completeScript = `<script>
    (function () {
      var code = ${JSON.stringify(code)};
      if (!code) return;
      if (window.whatsappSignupApi) {
        window.whatsappSignupApi.complete({ code: code, status: "connected", codeSource: "oauth_callback" });
      }
    })();
  </script>`;
  res.send(
    brandedShell({
      variant: code ? "success" : "error",
      headline: code ? "Almost done" : "Missing authorization code",
      bodyHtml: `<p>${
        code
          ? "Finishing WhatsApp setup in Exo…"
          : "Meta did not return a code. Close this window and try Connect with Meta again."
      }</p>${completeScript}`,
    }),
  );
});

module.exports = { router, embeddedSignupRedirectUri };
