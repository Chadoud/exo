/**
 * Transactional email via Resend. Config-gated like Stripe billing — when
 * disabled/unconfigured, sends are logged as an ALERT and reported as
 * `{ sent: false }` rather than thrown, so registration/reset/verification
 * flows never hard-fail because email delivery had a hiccup.
 */

const config = require("./config");

let resendSingleton = null;

/**
 * Exported (not just a local closure) so tests can swap it out by
 * reassigning `email.getResendClient`, the same require.cache + export-
 * reassignment convention used for every other lib fake in this codebase —
 * `sendEmail` below calls it through `module.exports` for that reason.
 */
function getResendClient() {
  if (!resendSingleton) {
    const { Resend } = require("resend");
    resendSingleton = new Resend(config.email.apiKey);
  }
  return resendSingleton;
}

/**
 * @param {{ to: string; subject: string; html: string; text: string }} message
 * @returns {Promise<{ sent: boolean }>}
 */
async function sendEmail({ to, subject, html, text }) {
  if (!config.email.enabled || !config.email.apiKey) {
    console.error(`[email] ALERT email disabled/unconfigured — dropped "${subject}" send`);
    return { sent: false };
  }
  const client = module.exports.getResendClient();
  try {
    const { error } = await client.emails.send({
      from: config.email.from,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error(`[email] ALERT Resend rejected "${subject}" send:`, error.message || error);
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    console.error(`[email] ALERT "${subject}" send threw:`, e?.message || e);
    return { sent: false };
  }
}

module.exports = { sendEmail, getResendClient };
