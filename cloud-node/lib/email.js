/**
 * Transactional email via Resend. Config-gated like Stripe billing — when
 * disabled/unconfigured, sends are logged and reported as `{ sent: false }`
 * rather than thrown, so registration/reset/verification flows never
 * hard-fail because email delivery had a hiccup.
 *
 * Every call logs a single `[email] outcome=<disabled|sent|rejected|error>`
 * line (grep for `outcome=` to alert on non-`sent` rates) — deliberately
 * never includes the recipient, since call sites only reach this when an
 * account already matched, so logging `to` would turn ops logs into an
 * account-existence oracle for anyone who can read them.
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
    // Deliberately omits `to` — this fires on every send while email is
    // disabled, so logging the recipient here would make server logs an
    // account-existence oracle for whoever can read them.
    console.error(`[email] outcome=disabled subject="${subject}"`);
    return { sent: false };
  }
  try {
    const client = module.exports.getResendClient();
    const { error } = await client.emails.send({
      from: config.email.from,
      to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error(`[email] outcome=rejected subject="${subject}" detail=${error.message || error}`);
      return { sent: false };
    }
    console.log(`[email] outcome=sent subject="${subject}"`);
    return { sent: true };
  } catch (e) {
    console.error(`[email] outcome=error subject="${subject}" detail=${e?.message || e}`);
    return { sent: false };
  }
}

module.exports = { sendEmail, getResendClient };
