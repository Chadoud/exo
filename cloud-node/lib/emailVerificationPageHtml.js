/**
 * Hosted pages for GET /auth/verify-email?token=... — same dark-theme shell
 * as oauthHandoffHtml.js. No deep link back into the app: verification only
 * lifts the social-auto-link gate, it never blocked using the app.
 *
 * Deliberately GET-renders a confirmation button rather than consuming the
 * token on GET: link-prefetching scanners/clients (corporate mail security,
 * some mobile browsers) issue GET requests for links in email without any
 * user intent, which would silently burn single-use tokens. Consumption only
 * happens on the POST a real click triggers.
 */

const { brandedShell, escapeHtml, POST_JSON_HELPER_SCRIPT } = require("./oauthHandoffHtml");

function missingTokenPageHtml() {
  return brandedShell({
    variant: "error",
    headline: "Verification link incomplete",
    bodyHtml: "<p>This link is missing its verification token. Request a new one from Exo's settings.</p>",
  });
}

/**
 * @param {{ token: string }} opts
 */
function confirmEmailPageHtml({ token }) {
  const safeToken = escapeHtml(token);
  const bodyHtml = `
    <p id="verify-subline">Confirm this is your email to finish verifying your Exo account.</p>
    <input type="hidden" id="verify-token" value="${safeToken}"/>
    <button type="button" class="cta-btn" id="verify-submit">Verify email</button>
    <p class="field-error hidden" id="verify-error" role="alert" style="margin-top: 14px; text-align: center;"></p>
    <p class="close-hint hidden" id="verify-success">Email verified. You can close this tab and keep using Exo.</p>
    ${POST_JSON_HELPER_SCRIPT}
    <script>
    (function () {
      var btn = document.getElementById("verify-submit");
      var errorEl = document.getElementById("verify-error");
      btn.addEventListener("click", function () {
        btn.disabled = true;
        errorEl.classList.add("hidden");
        postJson("/auth/verify-email", { token: document.getElementById("verify-token").value })
          .then(function (result) {
            if (!result.ok) {
              btn.disabled = false;
              errorEl.textContent = "This link expired or was already used. Request a new one from Exo's settings.";
              errorEl.classList.remove("hidden");
              return;
            }
            btn.classList.add("hidden");
            document.getElementById("verify-success").classList.remove("hidden");
          })
          .catch(function () {
            btn.disabled = false;
            errorEl.textContent = "Couldn't reach the server. Check your internet and try again.";
            errorEl.classList.remove("hidden");
          });
      });
    })();
    </script>`;
  return brandedShell({ variant: "neutral", headline: "Verify your email", bodyHtml });
}

/**
 * @param {{ token: string | null }} opts
 */
function verifyEmailPageHtml({ token }) {
  if (!token) return missingTokenPageHtml();
  return confirmEmailPageHtml({ token });
}

module.exports = { verifyEmailPageHtml };
