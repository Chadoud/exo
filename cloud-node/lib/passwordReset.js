/** Password reset tokens — see hashedTokenStore.js for the shared shape. */

const { createTokenStore } = require("./hashedTokenStore");

const RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

const store = createTokenStore("password_reset_tokens", RESET_TOKEN_TTL_SECONDS);

module.exports = {
  createResetToken: store.createToken,
  consumeResetToken: store.consumeToken,
  RESET_TOKEN_TTL_SECONDS,
};
