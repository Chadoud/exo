const express = require("express");
const {
  registerAccount,
  loginAccount,
  assertAccountActive,
  findPasswordAccountByEmail,
  setAccountPassword,
  getAccountEmailVerification,
  sendVerificationEmail,
} = require("../lib/accounts");
const { decodeToken } = require("../lib/tokens");
const { issueAuthTokens, rotateAuthTokens, revokeAccountRefreshTokens } = require("../lib/refreshTokens");
const { authRateLimitMiddleware } = require("../lib/authRateLimit");
const { createResetToken, consumeResetToken } = require("../lib/passwordReset");
const { consumeVerifyToken } = require("../lib/emailVerification");
const { sendEmail } = require("../lib/email");
const { resetPasswordTemplate } = require("../lib/emailTemplates");
const { forgotPasswordPageHtml, resetPasswordPageHtml } = require("../lib/passwordResetPagesHtml");
const { verifyEmailPageHtml } = require("../lib/emailVerificationPageHtml");
const { requireAuth } = require("../middleware/requireAuth");
const config = require("../lib/config");

const router = express.Router();

/** Always the same response shape regardless of whether the email exists — no enumeration. */
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  "If an Exo account uses that email, we've sent a link to reset the password.";

async function issueTokenResponse(accountId) {
  return issueAuthTokens(accountId);
}

function httpError(res, status, detail) {
  return res.status(status).json({ detail });
}

router.post("/register", authRateLimitMiddleware("register"), async (req, res) => {
  try {
    const email = String(req.body?.email || "");
    const password = String(req.body?.password || "");
    const firstName = String(req.body?.first_name || req.body?.firstName || "");
    const lastName = String(req.body?.last_name || req.body?.lastName || "");
    if (!email.includes("@")) {
      return httpError(res, 422, "Valid email required");
    }
    const result = await registerAccount(email, password, { firstName, lastName });
    return res.json({
      account_id: result.account_id,
      email: result.email,
      ...(await issueTokenResponse(result.account_id)),
    });
  } catch (e) {
    const status = e.status || 500;
    return httpError(res, status, e.message || "Registration failed");
  }
});

router.post("/login", authRateLimitMiddleware("login"), async (req, res) => {
  try {
    const email = String(req.body?.email || "");
    const password = String(req.body?.password || "");
    const { account_id } = await loginAccount(email, password);
    return res.json(await issueTokenResponse(account_id));
  } catch (e) {
    const status = e.status || 500;
    return httpError(res, status, e.message || "Login failed");
  }
});

router.post("/refresh", authRateLimitMiddleware("refresh"), async (req, res) => {
  const token = String(req.body?.refresh_token || "");
  const rotated = await rotateAuthTokens(token);
  if (!rotated.ok) {
    return httpError(res, rotated.status, rotated.detail);
  }
  const payload = decodeToken(token);
  try {
    await assertAccountActive(String(payload?.sub || ""));
  } catch (e) {
    return httpError(res, e.status || 401, e.message);
  }
  return res.json({
    access_token: rotated.access_token,
    refresh_token: rotated.refresh_token,
    token_type: rotated.token_type,
    expires_in: rotated.expires_in,
  });
});

router.post("/logout", authRateLimitMiddleware("refresh"), async (req, res) => {
  const token = String(req.body?.refresh_token || "");
  const payload = decodeToken(token);
  if (payload?.token_use === "refresh" && payload.sub) {
    await revokeAccountRefreshTokens(String(payload.sub));
  }
  return res.json({ ok: true });
});

router.get("/forgot-password/page", authRateLimitMiddleware("password_reset"), (_req, res) => {
  return res.status(200).type("html").send(forgotPasswordPageHtml());
});

router.post("/forgot-password", authRateLimitMiddleware("password_reset"), async (req, res) => {
  try {
    const email = String(req.body?.email || "");
    const account = email.includes("@") ? await findPasswordAccountByEmail(email) : null;
    if (account) {
      const token = await createResetToken(account.id);
      const resetUrl = `${config.appBaseUrl}/auth/reset-password/page?token=${encodeURIComponent(token)}`;
      const { subject, html, text } = resetPasswordTemplate(resetUrl);
      await sendEmail({ to: email.trim().toLowerCase(), subject, html, text });
    }
    // Same response whether or not the account exists, or is social-only.
    return res.json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
  } catch (e) {
    console.error("[auth] forgot-password failed:", e.message, e.stack || "");
    return httpError(res, 500, "Could not process request");
  }
});

router.get("/reset-password/page", authRateLimitMiddleware("password_reset"), (req, res) => {
  const token = req.query.token ? String(req.query.token) : null;
  return res.status(200).type("html").send(resetPasswordPageHtml({ token }));
});

router.post("/reset-password", authRateLimitMiddleware("password_reset"), async (req, res) => {
  try {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!token || !password) {
      return httpError(res, 422, "Token and password are required");
    }
    const accountId = await consumeResetToken(token);
    if (!accountId) {
      return httpError(res, 401, "invalid_or_expired_token");
    }
    await setAccountPassword(accountId, password);
    // A credential reset must sign the account out everywhere else.
    await revokeAccountRefreshTokens(accountId);
    return res.json({ ok: true });
  } catch (e) {
    const status = e.status || 500;
    return httpError(res, status, e.message || "Could not reset password");
  }
});

// GET only renders a confirm button — link-prefetching scanners/mail clients
// issue GETs without user intent and must never silently burn the token.
router.get("/verify-email", authRateLimitMiddleware("verify_email"), (req, res) => {
  const token = req.query.token ? String(req.query.token) : null;
  return res.status(200).type("html").send(verifyEmailPageHtml({ token }));
});

router.post("/verify-email", authRateLimitMiddleware("verify_email"), async (req, res) => {
  const token = String(req.body?.token || "");
  const accountId = token ? await consumeVerifyToken(token) : null;
  if (!accountId) {
    return httpError(res, 401, "invalid_or_expired_token");
  }
  return res.json({ ok: true });
});

router.post("/verify-email/resend", requireAuth, authRateLimitMiddleware("verify_email"), async (req, res) => {
  try {
    const account = await getAccountEmailVerification(req.accountId);
    if (!account) {
      return httpError(res, 404, "Account not found");
    }
    if (!account.emailVerified) {
      await sendVerificationEmail(req.accountId, account.email);
    }
    // Same response whether it was already verified or an email was just sent
    // — resending is a no-op, not an error, for an already-verified account.
    return res.json({ ok: true });
  } catch (e) {
    console.error("[auth] verify-email/resend failed:", e.message, e.stack || "");
    return httpError(res, 500, "Could not process request");
  }
});

module.exports = router;
