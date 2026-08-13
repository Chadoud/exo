const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Minimal in-memory pool mock for the accounts/auth_identities shape used by
 * resolveSocialAccount(). Accounts are seeded directly (not via
 * provisionAccount) so each test can control email_verified explicitly.
 */
function createIdentitiesMockPool(seedAccounts = []) {
  const accounts = new Map(seedAccounts.map((a) => [a.id, { ...a }]));
  const identities = [];

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

      if (normalized.startsWith("select id, email_verified from accounts where email")) {
        const [email] = params;
        const match = [...accounts.values()].find((a) => a.email === email && a.is_active);
        return [match ? [{ id: match.id, email_verified: match.email_verified }] : []];
      }

      if (normalized.startsWith("insert into accounts")) {
        // provisionAccount()'s INSERT — id is the 1st bound param.
        const [id, email, , , passwordHash, emailVerified] = params;
        accounts.set(id, {
          id,
          email,
          password_hash: passwordHash,
          email_verified: Boolean(emailVerified),
          is_active: true,
        });
        return [{ affectedRows: 1 }];
      }
      if (normalized.startsWith("insert into wallets") || normalized.startsWith("insert into entitlements") || normalized.startsWith("insert into user_profiles")) {
        return [{ affectedRows: 1 }];
      }

      if (normalized.startsWith("insert into auth_identities")) {
        const [accountId, provider, subject, emailAtLink] = params;
        identities.push({ accountId, provider, subject, emailAtLink });
        return [{ affectedRows: 1 }];
      }

      throw new Error(`unexpected execute in conn: ${sql}`);
    },
    release() {},
  };

  return {
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("select account_id from auth_identities")) {
        const [provider, subject] = params;
        const match = identities.find((i) => i.provider === provider && i.subject === subject);
        return [match ? [{ account_id: match.accountId }] : []];
      }
      throw new Error(`unexpected execute on pool: ${sql}`);
    },
    async getConnection() {
      return conn;
    },
    _accounts: accounts,
    _identities: identities,
  };
}

function freshIdentitiesModule(mockPool) {
  for (const name of ["../lib/db", "../lib/identities", "../lib/accounts", "../lib/emailVerification", "../lib/email"]) {
    delete require.cache[require.resolve(name)];
  }
  require("../lib/db").getPool = () => mockPool;
  // registerAccount()'s post-commit best-effort email send isn't exercised via
  // resolveSocialAccount(), but stub it out defensively in case that changes.
  require("../lib/email").sendEmail = async () => ({ sent: false });
  return require("../lib/identities");
}

test("regression: an unverified existing account is never auto-linked (account takeover fix)", async () => {
  // An attacker pre-registered victim@example.com with a password; it was
  // never verified. The real victim now signs in with Google using the same
  // email — this must NOT link to the attacker's account.
  const pool = createIdentitiesMockPool([
    { id: "attacker-acc", email: "victim@example.com", password_hash: "hash", email_verified: false, is_active: true },
  ]);
  const { resolveSocialAccount } = freshIdentitiesModule(pool);

  const result = await resolveSocialAccount({
    provider: "google",
    subject: "google-subject-victim",
    email: "victim@example.com",
  });

  assert.notEqual(result.account_id, "attacker-acc");
  assert.ok(pool._accounts.has(result.account_id));
  const newAccount = pool._accounts.get(result.account_id);
  // The new account is social-only (no password) and considered verified —
  // it's the real, provider-verified owner of the email.
  assert.equal(newAccount.password_hash, null);
  assert.equal(newAccount.email_verified, true);
  // The real victim's email is already taken (by the unverified squat), so
  // the new account must NOT reuse it — accounts.email is UNIQUE in
  // production and reusing it would throw ER_DUP_ENTRY, hard-failing the
  // real victim's sign-in instead of giving them a working account.
  assert.notEqual(newAccount.email, "victim@example.com");
  assert.match(newAccount.email, /@users\.exosites\.ch$/);
});

test("legit case: a verified existing account is linked to the new social identity", async () => {
  const pool = createIdentitiesMockPool([
    { id: "real-owner-acc", email: "owner@example.com", password_hash: "hash", email_verified: true, is_active: true },
  ]);
  const { resolveSocialAccount } = freshIdentitiesModule(pool);

  const result = await resolveSocialAccount({
    provider: "google",
    subject: "google-subject-owner",
    email: "owner@example.com",
  });

  assert.equal(result.account_id, "real-owner-acc");
  assert.equal(pool._identities.length, 1);
  assert.equal(pool._identities[0].accountId, "real-owner-acc");
});

test("known (provider, subject) identity short-circuits straight to its account", async () => {
  const pool = createIdentitiesMockPool([
    { id: "known-acc", email: "someone@example.com", password_hash: null, email_verified: true, is_active: true },
  ]);
  pool._identities.push({ accountId: "known-acc", provider: "apple", subject: "apple-subject-1", emailAtLink: "someone@example.com" });
  const { resolveSocialAccount } = freshIdentitiesModule(pool);

  const result = await resolveSocialAccount({
    provider: "apple",
    subject: "apple-subject-1",
    email: "someone@example.com",
  });

  assert.equal(result.account_id, "known-acc");
});
