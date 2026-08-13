/**
 * Resolve a verified provider identity to an EXO account, creating or linking as needed.
 *
 * Resolution order:
 *   1. Known (provider, subject) → that account.
 *   2. Provider-verified email matches an existing account whose email we
 *      have also verified locally (accounts.email_verified = 1) → link this
 *      identity to it.
 *   3. Otherwise → create a new social-only account (no password).
 *
 * The email_verified condition in step 2 is the fix for an account-takeover
 * vector: without it, an attacker could register victim@example.com with a
 * password (registration requires no verification) and permanently own any
 * future Google/Apple sign-in from the real victim, since step 2 would blindly
 * link to the attacker's unverified squatted account. Requiring local
 * verification means an unverified account is never a valid link target — the
 * real victim instead falls through to step 3 and gets a fresh account.
 *
 * Step 3 must not reuse the victim's real email for that fresh account when
 * it's already taken by the (unverified) squatter row — accounts.email has a
 * UNIQUE constraint, so blindly reusing it would throw ER_DUP_ENTRY and the
 * real victim's sign-in would hard-fail. So step 3 falls back to the same
 * provider-scoped synthetic email already used when a provider returns no
 * email at all.
 */

const { v4: uuidv4 } = require("uuid");
const { getPool } = require("./db");
const { provisionAccount } = require("./accounts");

/**
 * @param {{ provider: "google" | "apple"; subject: string; email: string | null }} identity
 * @returns {Promise<{ account_id: string; email: string | null }>}
 */
async function resolveSocialAccount({ provider, subject, email }) {
  const pool = getPool();
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  const [identityRows] = await pool.execute(
    "SELECT account_id FROM auth_identities WHERE provider = ? AND provider_subject = ? LIMIT 1",
    [provider, subject],
  );
  if (identityRows.length > 0) {
    return { account_id: identityRows[0].account_id, email: normalizedEmail };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let accountId = null;
    let emailTaken = false;
    if (normalizedEmail) {
      const [accountRows] = await conn.execute(
        "SELECT id, email_verified FROM accounts WHERE email = ? AND is_active = 1 LIMIT 1",
        [normalizedEmail],
      );
      if (accountRows.length > 0) {
        emailTaken = true;
        if (accountRows[0].email_verified) {
          accountId = accountRows[0].id;
        }
      }
    }

    if (!accountId) {
      accountId = uuidv4();
      // Social accounts without a usable provider email still need a unique
      // placeholder: either the provider returned none (e.g. Apple private
      // relay declined), or the real email is already taken by an unverified
      // squatted account (see file header). Use a provider-scoped synthetic
      // email in both cases.
      const emailForAccount =
        normalizedEmail && !emailTaken ? normalizedEmail : `${provider}_${subject}@users.exosites.ch`;
      await provisionAccount(conn, accountId, emailForAccount, null);
    }

    await conn.execute(
      `INSERT INTO auth_identities (account_id, provider, provider_subject, email_at_link)
       VALUES (?, ?, ?, ?)`,
      [accountId, provider, subject, normalizedEmail],
    );

    await conn.commit();
    return { account_id: accountId, email: normalizedEmail };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { resolveSocialAccount };
