const test = require("node:test");
const assert = require("node:assert/strict");

/** Minimal in-memory pool mock for the email_verification_tokens table shape. */
function createVerifyTokenMockPool() {
  const rows = new Map();
  const accounts = new Map();

  function findByHash(tokenHash) {
    return rows.get(tokenHash) || null;
  }

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("select account_id from email_verification_tokens")) {
        const [tokenHash] = params;
        const row = findByHash(tokenHash);
        const isUsable = row && !row.consumed_at && row.expires_at.getTime() > Date.now();
        return [isUsable ? [{ account_id: row.account_id }] : []];
      }
      if (normalized.startsWith("update email_verification_tokens set consumed_at")) {
        const [tokenHash] = params;
        const row = findByHash(tokenHash);
        if (row) row.consumed_at = new Date();
        return [{ affectedRows: row ? 1 : 0 }];
      }
      if (normalized.startsWith("update accounts set email_verified")) {
        const [accountId] = params;
        accounts.set(accountId, true);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected execute in conn: ${sql}`);
    },
    release() {},
  };

  return {
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("insert into email_verification_tokens")) {
        const [tokenHash, accountId, expiresAt] = params;
        rows.set(tokenHash, { account_id: accountId, expires_at: expiresAt, consumed_at: null });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected execute on pool: ${sql}`);
    },
    async getConnection() {
      return conn;
    },
    _rows: rows,
    _verifiedAccounts: accounts,
  };
}

function freshEmailVerificationModule(mockPool) {
  for (const name of ["../lib/db", "../lib/hashedTokenStore", "../lib/refreshTokens", "../lib/emailVerification"]) {
    delete require.cache[require.resolve(name)];
  }
  require("../lib/db").getPool = () => mockPool;
  const revokedAccounts = [];
  require("../lib/refreshTokens").revokeAccountRefreshTokens = async (accountId) => {
    revokedAccounts.push(accountId);
  };
  return { ...require("../lib/emailVerification"), _revokedAccounts: revokedAccounts };
}

test("createVerifyToken then consumeVerifyToken marks the account verified and revokes its sessions", async () => {
  const pool = createVerifyTokenMockPool();
  const { createVerifyToken, consumeVerifyToken, _revokedAccounts } = freshEmailVerificationModule(pool);

  const token = await createVerifyToken("acc-1");
  const accountId = await consumeVerifyToken(token);

  assert.equal(accountId, "acc-1");
  assert.equal(pool._verifiedAccounts.get("acc-1"), true);
  // Containment against email squatting: any session the account already
  // held (e.g. an attacker who pre-registered this email) is killed here.
  assert.deepEqual(_revokedAccounts, ["acc-1"]);
});

test("consumeVerifyToken does not revoke sessions when the token is invalid", async () => {
  const pool = createVerifyTokenMockPool();
  const { consumeVerifyToken, _revokedAccounts } = freshEmailVerificationModule(pool);

  const accountId = await consumeVerifyToken("not-a-real-token");

  assert.equal(accountId, null);
  assert.deepEqual(_revokedAccounts, []);
});

test("consumeVerifyToken is single-use", async () => {
  const pool = createVerifyTokenMockPool();
  const { createVerifyToken, consumeVerifyToken } = freshEmailVerificationModule(pool);

  const token = await createVerifyToken("acc-1");
  const first = await consumeVerifyToken(token);
  const second = await consumeVerifyToken(token);
  assert.equal(first, "acc-1");
  assert.equal(second, null);
});

test("consumeVerifyToken rejects an unknown or expired token", async () => {
  const pool = createVerifyTokenMockPool();
  const { createVerifyToken, consumeVerifyToken } = freshEmailVerificationModule(pool);

  assert.equal(await consumeVerifyToken("not-a-real-token"), null);

  const token = await createVerifyToken("acc-2");
  for (const row of pool._rows.values()) {
    row.expires_at = new Date(Date.now() - 1000);
  }
  assert.equal(await consumeVerifyToken(token), null);
});
