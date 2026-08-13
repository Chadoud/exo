const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

test("deleteAccount purges telemetry and records deletion audit", async () => {
  const accountId = "acc-test-001";
  const executed = [];

  const conn = {
    async beginTransaction() {
      executed.push("begin");
    },
    async commit() {
      executed.push("commit");
    },
    async rollback() {
      executed.push("rollback");
    },
    async execute(sql, params = []) {
      executed.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      return [{ affectedRows: 1 }];
    },
    release() {},
  };

  const pool = {
    async getConnection() {
      return conn;
    },
  };

  delete require.cache[require.resolve("../lib/db")];
  delete require.cache[require.resolve("../lib/accountLifecycle")];
  require("../lib/db").getPool = () => pool;

  const { deleteAccount } = require("../lib/accountLifecycle");
  await deleteAccount(accountId);

  const telemetryDelete = executed.find(
    (e) => typeof e === "object" && /delete from telemetry_events/i.test(e.sql),
  );
  assert.ok(telemetryDelete);
  assert.deepEqual(telemetryDelete.params, [accountId]);

  const feedbackDelete = executed.find(
    (e) => typeof e === "object" && /delete from product_feedback/i.test(e.sql),
  );
  assert.ok(feedbackDelete);

  const crashDelete = executed.find(
    (e) => typeof e === "object" && /delete from crash_reports/i.test(e.sql),
  );
  assert.ok(crashDelete);
  assert.deepEqual(crashDelete.params, [accountId]);

  const sessionsDelete = executed.find(
    (e) => typeof e === "object" && /delete from app_sessions/i.test(e.sql),
  );
  assert.ok(sessionsDelete);
  assert.deepEqual(sessionsDelete.params, [accountId]);

  const auditInsert = executed.find(
    (e) => typeof e === "object" && /insert into accounts_deleted_at/i.test(e.sql),
  );
  assert.ok(auditInsert);
  assert.equal(
    auditInsert.params[0],
    crypto.createHash("sha256").update(accountId).digest("hex"),
  );
  const syncChangesDelete = executed.find(
    (e) => typeof e === "object" && /delete from sync_changes/i.test(e.sql),
  );
  assert.ok(syncChangesDelete);
  assert.deepEqual(syncChangesDelete.params, [accountId]);

  const pairingGrantsDelete = executed.find(
    (e) => typeof e === "object" && /delete from sync_pairing_grants/i.test(e.sql),
  );
  assert.ok(pairingGrantsDelete);
  assert.deepEqual(pairingGrantsDelete.params, [accountId]);

  assert.ok(executed.includes("commit"));
});

test("deleteAccount tolerates sync_changes/sync_pairing_grants not existing yet (pre-migration-023)", async () => {
  const accountId = "acc-test-002";
  const executed = [];

  const conn = {
    async beginTransaction() {
      executed.push("begin");
    },
    async commit() {
      executed.push("commit");
    },
    async rollback() {
      executed.push("rollback");
    },
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      executed.push({ sql: normalized, params });
      if (/delete from sync_changes|delete from sync_pairing_grants/i.test(normalized)) {
        const err = new Error("no such table");
        err.code = "ER_NO_SUCH_TABLE";
        throw err;
      }
      return [{ affectedRows: 1 }];
    },
    release() {},
  };

  const pool = {
    async getConnection() {
      return conn;
    },
  };

  delete require.cache[require.resolve("../lib/db")];
  delete require.cache[require.resolve("../lib/accountLifecycle")];
  require("../lib/db").getPool = () => pool;

  const { deleteAccount } = require("../lib/accountLifecycle");
  await deleteAccount(accountId);

  const accountsDelete = executed.find(
    (e) => typeof e === "object" && /delete from accounts where/i.test(e.sql),
  );
  assert.ok(accountsDelete, "deletion continues past missing sync_changes/sync_pairing_grants tables");
  assert.ok(executed.includes("commit"));
  assert.ok(!executed.includes("rollback"));
});
