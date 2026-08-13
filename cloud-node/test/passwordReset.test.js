const test = require("node:test");
const assert = require("node:assert/strict");

/** Minimal in-memory pool mock for the password_reset_tokens table shape. */
function createResetTokenMockPool() {
  const rows = new Map();

  function findByHash(tokenHash) {
    return rows.get(tokenHash) || null;
  }

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("select account_id from password_reset_tokens")) {
        const [tokenHash] = params;
        const row = findByHash(tokenHash);
        const isUsable = row && !row.consumed_at && row.expires_at.getTime() > Date.now();
        return [isUsable ? [{ account_id: row.account_id }] : []];
      }
      if (normalized.startsWith("update password_reset_tokens set consumed_at")) {
        const [tokenHash] = params;
        const row = findByHash(tokenHash);
        if (row) row.consumed_at = new Date();
        return [{ affectedRows: row ? 1 : 0 }];
      }
      throw new Error(`unexpected execute in conn: ${sql}`);
    },
    release() {},
  };

  return {
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("insert into password_reset_tokens")) {
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
  };
}

function freshPasswordResetModule(mockPool) {
  for (const name of ["../lib/db", "../lib/hashedTokenStore", "../lib/passwordReset"]) {
    delete require.cache[require.resolve(name)];
  }
  require("../lib/db").getPool = () => mockPool;
  return require("../lib/passwordReset");
}

test("createResetToken then consumeResetToken returns the account id once", async () => {
  const pool = createResetTokenMockPool();
  const { createResetToken, consumeResetToken } = freshPasswordResetModule(pool);

  const token = await createResetToken("acc-1");
  assert.equal(typeof token, "string");
  assert.ok(token.length > 20);

  const accountId = await consumeResetToken(token);
  assert.equal(accountId, "acc-1");
});

test("consumeResetToken is single-use", async () => {
  const pool = createResetTokenMockPool();
  const { createResetToken, consumeResetToken } = freshPasswordResetModule(pool);

  const token = await createResetToken("acc-1");
  const first = await consumeResetToken(token);
  const second = await consumeResetToken(token);
  assert.equal(first, "acc-1");
  assert.equal(second, null);
});

test("consumeResetToken rejects an expired token", async () => {
  const pool = createResetTokenMockPool();
  const { createResetToken, consumeResetToken } = freshPasswordResetModule(pool);

  const token = await createResetToken("acc-1");
  for (const row of pool._rows.values()) {
    row.expires_at = new Date(Date.now() - 1000);
  }
  const accountId = await consumeResetToken(token);
  assert.equal(accountId, null);
});

test("consumeResetToken rejects an unknown token", async () => {
  const pool = createResetTokenMockPool();
  const { consumeResetToken } = freshPasswordResetModule(pool);

  const accountId = await consumeResetToken("not-a-real-token");
  assert.equal(accountId, null);
});
