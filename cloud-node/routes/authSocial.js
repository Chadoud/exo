const crypto = require("crypto");
const express = require("express");
const config = require("../lib/config");
const google = require("../lib/oauthGoogle");
const apple = require("../lib/oauthApple");
const { signState, verifyState } = require("../lib/stateTokens");
const { resolveSocialAccount } = require("../lib/identities");
const { createExchangeCode, consumeExchangeCode } = require("../lib/exchangeCodes");
const { issueAuthTokens } = require("../lib/refreshTokens");
const { getPool } = require("../lib/db");
const { oauthHandoffPageHtml } = require("../lib/oauthHandoffHtml");
const { mapSocialCallbackError } = require("../lib/authCallbackErrors");
const { authRateLimitMiddleware } = require("../lib/authRateLimit");

const router = express.Router();

/** Express 4 does not catch async rejections — wrap handlers so users never see a bare 500. */
function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      console.error("[auth] unhandled route error:", err.message, err.stack || "");
      try {
        if (!res.headersSent) {
          donePage(res, { error: mapSocialCallbackError(err) });
        }
      } catch (fallbackErr) {
        console.error("[auth] fallback redirect failed:", fallbackErr.message);
        if (!res.headersSent) {
          res.status(503).type("text/plain").send("Sign-in failed. Close this tab and try again from Exo.");
        }
      }
    });
  };
}

function providerLib(name) {
  if (name === "google") return google;
  if (name === "apple") return apple;
  return null;
}

/** Final page the desktop auth window lands on; it reads exo_code from the URL. */
function donePage(res, params) {
  const url = `${config.appBaseUrl}/auth/done?${new URLSearchParams(params).toString()}`;
  return res.redirect(302, url);
}

router.get("/start/:provider", authRateLimitMiddleware("social"), (req, res) => {
  const provider = req.params.provider;
  const lib = providerLib(provider);
  if (!lib || !lib.isConfigured()) {
    return res.status(404).send("Provider not available");
  }
  const nonce = crypto.randomBytes(16).toString("base64url");

  if (provider === "google") {
    const { verifier, challenge } = google.generatePkce();
    const state = signState({ provider, nonce, codeVerifier: verifier });
    return res.redirect(302, google.buildAuthUrl({ state, nonce, codeChallenge: challenge }));
  }
  const state = signState({ provider, nonce });
  return res.redirect(302, apple.buildAuthUrl({ state, nonce }));
});

/**
 * Shared callback tail: verify state, exchange code, verify id_token, resolve the
 * account, then hand the desktop a single-use code via the done page.
 */
async function completeCallback(provider, code, stateToken, res) {
  const state = verifyState(stateToken);
  if (!state || state.provider !== provider) {
    return donePage(res, { error: "invalid_state" });
  }
  try {
    const lib = providerLib(provider);
    const idToken =
      provider === "google"
        ? await google.exchangeCode(code, state.codeVerifier)
        : await apple.exchangeCode(code);
    const { subject, email } = await lib.verifyIdToken(idToken, state.nonce);
    const { account_id } = await resolveSocialAccount({ provider, subject, email });
    const exoCode = await createExchangeCode(account_id);
    if (state.platform === "mobile") {
      const qs = new URLSearchParams({ exo_code: exoCode }).toString();
      return res.redirect(302, `exosites://oauth?${qs}`);
    }
    return donePage(res, { exo_code: exoCode });
  } catch (e) {
    console.error(`[auth] ${provider} callback failed:`, e.message, e.stack || "");
    return donePage(res, { error: mapSocialCallbackError(e) });
  }
}

router.get("/mobile/start/:provider", authRateLimitMiddleware("social"), (req, res) => {
  const provider = req.params.provider;
  const lib = providerLib(provider);
  if (!lib || !lib.isConfigured()) {
    return res.status(404).send("Provider not available");
  }
  const nonce = crypto.randomBytes(16).toString("base64url");
  if (provider === "google") {
    const { verifier, challenge } = google.generatePkce();
    const state = signState({ provider, nonce, codeVerifier: verifier, platform: "mobile" });
    return res.redirect(302, google.buildAuthUrl({ state, nonce, codeChallenge: challenge }));
  }
  const state = signState({ provider, nonce, platform: "mobile" });
  return res.redirect(302, apple.buildAuthUrl({ state, nonce }));
});

router.get("/google/callback", authRateLimitMiddleware("social"), asyncRoute(async (req, res) => {
  const oauthError = String(req.query.error || "");
  if (oauthError) {
    const mapped = oauthError === "access_denied" ? "cancelled" : "signin_failed";
    return donePage(res, { error: mapped });
  }
  const code = String(req.query.code || "");
  const stateToken = String(req.query.state || "");
  if (!code) return donePage(res, { error: "no_code" });
  return completeCallback("google", code, stateToken, res);
}));

// Apple uses response_mode=form_post → credentials arrive as urlencoded body.
router.post(
  "/apple/callback",
  express.urlencoded({ extended: false, limit: "64kb" }),
  authRateLimitMiddleware("social"),
  asyncRoute(async (req, res) => {
    const oauthError = String(req.body?.error || "");
    if (oauthError) {
      const mapped =
        oauthError === "user_cancelled_authorize" ? "cancelled" : "signin_failed";
      return donePage(res, { error: mapped });
    }
    const code = String(req.body?.code || "");
    const stateToken = String(req.body?.state || "");
    if (!code) return donePage(res, { error: "no_code" });
    return completeCallback("apple", code, stateToken, res);
  }),
);

router.get("/done", (req, res) => {
  const exoCode = req.query.exo_code ? String(req.query.exo_code) : "";
  const error = req.query.error ? String(req.query.error) : "";
  const params = new URLSearchParams();
  if (exoCode) params.set("exo_code", exoCode);
  if (error) params.set("error", error);
  const qs = params.toString();
  const deepLink = qs ? `exo://auth/callback?${qs}` : "exo://auth/callback?error=signin_failed";
  res.status(200).type("html").send(oauthHandoffPageHtml({ deepLink, error }));
});

router.post("/exchange", authRateLimitMiddleware("social"), asyncRoute(async (req, res) => {
  const code = String(req.body?.code || "");
  if (!code) return res.status(400).json({ detail: "Missing code" });
  try {
    const accountId = await consumeExchangeCode(code);
    if (!accountId) {
      return res.status(401).json({ detail: "Invalid or expired code" });
    }
    const [rows] = await getPool().execute(
      "SELECT email FROM accounts WHERE id = ? LIMIT 1",
      [accountId],
    );
    return res.json({
      ...(await issueAuthTokens(accountId)),
      email: rows[0]?.email || null,
    });
  } catch (e) {
    console.error("[auth] exchange failed:", e.message, e.stack || "");
    const mapped = mapSocialCallbackError(e);
    const status = mapped === "server_setup" ? 503 : 500;
    return res.status(status).json({ detail: mapped === "server_setup" ? "Server setup incomplete" : "Sign-in exchange failed" });
  }
}));

module.exports = router;
