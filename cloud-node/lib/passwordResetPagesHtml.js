/**
 * Hosted password-reset pages: the "request a reset link" page (linked from
 * the desktop app's "Forgot password?") and the "set new password" page
 * (linked from the reset email). Self-contained, no client bundle — same
 * dark-theme shell as oauthHandoffHtml.js so every server-rendered auth page
 * looks consistent.
 *
 * The reset token is only ever validated server-side on submit (POST
 * /auth/reset-password) — loading the page never consumes it.
 */

const { brandedShell, escapeHtml, POST_JSON_HELPER_SCRIPT } = require("./oauthHandoffHtml");

const MIN_PASSWORD_LENGTH = 8;

function missingTokenPageHtml() {
  return brandedShell({
    variant: "error",
    headline: "Reset link incomplete",
    bodyHtml: "<p>This link is missing its reset token. Request a new one from the sign-in screen.</p>",
  });
}

/** GET /auth/forgot-password/page — email entry, no token yet. */
function forgotPasswordPageHtml() {
  const bodyHtml = `
    <p id="forgot-subline">Enter the email you use for Exo and we'll send you a link to reset your password.</p>
    <form id="forgot-form" novalidate>
      <label class="field-label" for="forgot-email">Email</label>
      <input class="field-input" type="email" id="forgot-email" autocomplete="email" required/>
      <p class="field-error hidden" id="forgot-error" role="alert"></p>
      <button type="submit" class="cta-btn" id="forgot-submit">Send reset link</button>
    </form>
    <p class="close-hint hidden" id="forgot-success">If an Exo account uses that email, we've sent a link to reset the password. You can close this tab.</p>
    ${FIELD_STYLES}
    ${POST_JSON_HELPER_SCRIPT}
    <script>
    (function () {
      var form = document.getElementById("forgot-form");
      var errorEl = document.getElementById("forgot-error");
      var submitBtn = document.getElementById("forgot-submit");
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        errorEl.classList.add("hidden");
        var email = document.getElementById("forgot-email").value.trim();
        if (!email.includes("@")) {
          errorEl.textContent = "Enter a valid email address.";
          errorEl.classList.remove("hidden");
          return;
        }
        submitBtn.disabled = true;
        postJson("/auth/forgot-password", { email: email })
          .then(function (result) {
            if (!result.ok) {
              submitBtn.disabled = false;
              errorEl.textContent = "Couldn't process your request. Try again.";
              errorEl.classList.remove("hidden");
              return;
            }
            form.classList.add("hidden");
            document.getElementById("forgot-success").classList.remove("hidden");
          })
          .catch(function () {
            submitBtn.disabled = false;
            errorEl.textContent = "Couldn't reach the server. Check your internet and try again.";
            errorEl.classList.remove("hidden");
          });
      });
    })();
    </script>`;
  return brandedShell({ variant: "neutral", headline: "Reset your password", bodyHtml });
}

const FIELD_STYLES = `<style>
  .field-label { display: block; text-align: left; font-size: 0.85rem; color: var(--muted); margin: 14px 0 6px; }
  .field-input {
    width: 100%; padding: 0.6rem 0.8rem; border-radius: 10px;
    border: 1px solid var(--border); background: #11131c; color: var(--text);
    font-family: inherit; font-size: 0.95rem;
  }
  .field-input:focus-visible { outline: 2px solid rgba(108, 99, 255, 0.55); outline-offset: 1px; }
  .field-error { color: var(--error); font-size: 0.85rem; text-align: left; margin-top: 10px; }
  .field-error.hidden { display: none; }
  #forgot-submit, #reset-submit { width: 100%; }
</style>`;

/** GET /auth/reset-password/page?token=... — set a new password. */
function resetPasswordFormPageHtml({ token }) {
  const safeToken = escapeHtml(token);
  const bodyHtml = `
    <p id="reset-subline">Choose a new password for your Exo account.</p>
    <form id="reset-form" novalidate>
      <input type="hidden" id="reset-token" value="${safeToken}"/>
      <label class="field-label" for="reset-password">New password</label>
      <input class="field-input" type="password" id="reset-password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required/>
      <label class="field-label" for="reset-password-confirm">Confirm password</label>
      <input class="field-input" type="password" id="reset-password-confirm" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" required/>
      <p class="field-error hidden" id="reset-error" role="alert"></p>
      <button type="submit" class="cta-btn" id="reset-submit">Set new password</button>
    </form>
    <p class="close-hint hidden" id="reset-success">Password updated. You've been signed out everywhere else — sign in again from Exo.</p>
    ${FIELD_STYLES}
    ${POST_JSON_HELPER_SCRIPT}
    <script>
    (function () {
      var form = document.getElementById("reset-form");
      var errorEl = document.getElementById("reset-error");
      var submitBtn = document.getElementById("reset-submit");
      function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
      }
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        errorEl.classList.add("hidden");
        var password = document.getElementById("reset-password").value;
        var confirm = document.getElementById("reset-password-confirm").value;
        if (password.length < ${MIN_PASSWORD_LENGTH}) {
          showError("Password must be at least ${MIN_PASSWORD_LENGTH} characters.");
          return;
        }
        if (password !== confirm) {
          showError("Passwords don't match.");
          return;
        }
        submitBtn.disabled = true;
        postJson("/auth/reset-password", { token: document.getElementById("reset-token").value, password: password })
          .then(function (result) {
            if (!result.ok) {
              submitBtn.disabled = false;
              showError(result.body && result.body.detail === "invalid_or_expired_token"
                ? "This link expired or was already used. Request a new one from the sign-in screen."
                : "Couldn't reset your password. Try again.");
              return;
            }
            form.classList.add("hidden");
            document.getElementById("reset-success").classList.remove("hidden");
          })
          .catch(function () {
            submitBtn.disabled = false;
            showError("Couldn't reach the server. Check your internet and try again.");
          });
      });
    })();
    </script>`;
  return brandedShell({ variant: "neutral", headline: "Reset your password", bodyHtml });
}

/**
 * @param {{ token: string | null }} opts
 */
function resetPasswordPageHtml({ token }) {
  if (!token) return missingTokenPageHtml();
  return resetPasswordFormPageHtml({ token });
}

module.exports = { forgotPasswordPageHtml, resetPasswordPageHtml, MIN_PASSWORD_LENGTH };
