/**
 * Plain-text + minimal HTML bodies for transactional emails.
 *
 * Kept dependency-free (no templating engine) since there are only two
 * emails today; revisit if/when the lifecycle-email set grows.
 */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function wrapHtml(bodyHtml) {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #1a1a1a; max-width: 480px; margin: 0 auto; padding: 24px;">
    ${bodyHtml}
    <p style="color: #888; font-size: 12px; margin-top: 32px;">Exo — exosites.ch</p>
  </body>
</html>`;
}

/**
 * @param {string} verifyUrl
 */
function verifyEmailTemplate(verifyUrl) {
  const safeUrl = escapeHtml(verifyUrl);
  return {
    subject: "Verify your email for Exo",
    text: `Confirm this is your email address to finish setting up your Exo account:\n\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't create an Exo account, you can ignore this email.`,
    html: wrapHtml(`
      <h2 style="font-size: 18px;">Verify your email</h2>
      <p>Confirm this is your email address to finish setting up your Exo account.</p>
      <p><a href="${safeUrl}" style="display: inline-block; background: #111; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Verify email</a></p>
      <p style="color: #666; font-size: 13px;">This link expires in 24 hours. If you didn't create an Exo account, you can ignore this email.</p>
    `),
  };
}

/**
 * @param {string} resetUrl
 */
function resetPasswordTemplate(resetUrl) {
  const safeUrl = escapeHtml(resetUrl);
  return {
    subject: "Reset your Exo password",
    text: `We received a request to reset your Exo password:\n\n${resetUrl}\n\nThis link expires in 1 hour and can only be used once. If you didn't request this, you can ignore this email — your password won't change.`,
    html: wrapHtml(`
      <h2 style="font-size: 18px;">Reset your password</h2>
      <p>We received a request to reset your Exo password.</p>
      <p><a href="${safeUrl}" style="display: inline-block; background: #111; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Reset password</a></p>
      <p style="color: #666; font-size: 13px;">This link expires in 1 hour and can only be used once. If you didn't request this, you can ignore this email — your password won't change.</p>
    `),
  };
}

module.exports = { verifyEmailTemplate, resetPasswordTemplate };
