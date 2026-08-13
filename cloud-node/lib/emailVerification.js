/** Email verification tokens — see hashedTokenStore.js for the shared shape. */

const { createTokenStore } = require("./hashedTokenStore");
const { revokeAccountRefreshTokens } = require("./refreshTokens");

const VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours

const store = createTokenStore("email_verification_tokens", VERIFY_TOKEN_TTL_SECONDS);

/**
 * Atomically consume a verify token and mark the account's email verified.
 * Returns the account id, or null if the token is missing, expired, or
 * already used.
 *
 * Also revokes every existing refresh token for the account. This is a
 * deliberate containment step against email squatting: an attacker who
 * pre-registers a victim's email with a password gets a live session
 * immediately, and the verification email is the victim's only signal that
 * something is wrong. If the victim (confused, or deliberately reclaiming
 * the account) follows the link, any session the attacker already holds is
 * killed at that moment — same treatment as a password reset. It does not
 * by itself invalidate the attacker's password (that still requires the
 * victim to run password-reset), but it closes the "stay silently logged in
 * forever" half of the exposure without adding friction for the normal case
 * (a user verifying their own just-created account has nothing to lose).
 * @param {string} token
 * @returns {Promise<string | null>}
 */
async function consumeVerifyToken(token) {
  const accountId = await store.consumeToken(token, {
    onConsume: (conn, id) => conn.execute("UPDATE accounts SET email_verified = 1 WHERE id = ?", [id]),
  });
  if (accountId) {
    await revokeAccountRefreshTokens(accountId);
  }
  return accountId;
}

module.exports = { createVerifyToken: store.createToken, consumeVerifyToken, VERIFY_TOKEN_TTL_SECONDS };
