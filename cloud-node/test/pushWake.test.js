const test = require("node:test");
const assert = require("node:assert/strict");
const { createSyncMockPool } = require("./helpers/mockPool");

process.env.JWT_SECRET = "sync-relay-test-secret";

function loadWake(mock) {
  delete require.cache[require.resolve("../lib/pushWake")];
  delete require.cache[require.resolve("../lib/syncRelay")];
  delete require.cache[require.resolve("../lib/db")];
  const db = require("../lib/db");
  db.getPool = () => mock;
  return { wake: require("../lib/pushWake"), syncRelay: require("../lib/syncRelay") };
}

test("wakeTypesFromBlobs ignores collections that were not accepted", () => {
  const { wakeTypesFromBlobs, WAKE_TASK_DUE } = require("../lib/pushWake");
  assert.deepEqual(
    wakeTypesFromBlobs([{ collection: "tasks" }, { collection: "pending_actions" }]),
    [WAKE_TASK_DUE, require("../lib/pushWake").WAKE_ACTION_READY],
  );
  assert.deepEqual(wakeTypesFromBlobs([{ collection: "memory_entries" }]), []);
});

test("wakeTypesFromBlobs maps collections without reading ciphertext", () => {
  const { wakeTypesFromBlobs, WAKE_TASK_DUE, WAKE_ACTION_READY } = require("../lib/pushWake");
  assert.deepEqual(wakeTypesFromBlobs([{ collection: "tasks", ciphertext: "SECRET" }]), [
    WAKE_TASK_DUE,
  ]);
  assert.deepEqual(wakeTypesFromBlobs([{ collection: "pending_actions" }]), [WAKE_ACTION_READY]);
  assert.deepEqual(wakeTypesFromBlobs([{ collection: "memory_entries" }]), []);
});

test("wakeAccount sends generic type only and never logs the raw token", async () => {
  const mock = createSyncMockPool();
  const { wake, syncRelay } = loadWake(mock);
  wake.resetRateLimitForTests();
  await syncRelay.registerDevice("acc-1", {
    deviceId: "dev-1",
    name: "iPhone",
    platform: "ios",
    pushToken: "super-secret-token",
  });
  const sent = [];
  const result = await wake.wakeAccount("acc-1", wake.WAKE_TASK_DUE, {
    send: async (payload) => {
      sent.push(payload);
      return { ok: true };
    },
  });
  assert.equal(result.sent, 1);
  assert.equal(sent[0].type, "task_due");
  assert.equal(sent[0].title, "Task due");
  assert.ok(!JSON.stringify(sent[0]).includes("invoice"));
  assert.equal(sent[0].token, "super-secret-token");
  assert.notEqual(wake.tokenFingerprint("super-secret-token"), "super-secret-token");
});

test("wakeAccount rate-limits and invalidates dead tokens", async () => {
  const mock = createSyncMockPool();
  const { wake, syncRelay } = loadWake(mock);
  wake.resetRateLimitForTests();
  await syncRelay.registerDevice("acc-2", {
    deviceId: "dev-dead",
    name: "Pixel",
    platform: "android",
    pushToken: "dead-token",
  });
  let now = 1_000;
  await wake.wakeAccount("acc-2", wake.WAKE_ACTION_READY, {
    now: () => now,
    send: async () => ({ ok: false, invalidate: true }),
  });
  assert.equal(mock.devices.get("dev-dead").pushToken, null);

  now = 2_000;
  wake.resetRateLimitForTests();
  const limited = [];
  for (let i = 0; i < 12; i += 1) {
    const out = await wake.wakeAccount("acc-2", wake.WAKE_TASK_DUE, {
      now: () => now + i,
      listTargets: async () => [{ id: "x", platform: "ios", token: "t" }],
      send: async () => {
        limited.push(1);
        return { ok: true };
      },
    });
    if (i >= 10) assert.equal(out.reason, "rate_limited");
  }
  assert.equal(limited.length, 10);
});

test("pushBlobs accepts inbox collections and rejects unknown ones", async () => {
  delete require.cache[require.resolve("../lib/syncRelay")];
  delete require.cache[require.resolve("../lib/db")];
  const mock = createSyncMockPool();
  require("../lib/db").getPool = () => mock;
  const syncRelay = require("../lib/syncRelay");
  const bad = await syncRelay.pushBlobs("acc", [
    {
      collection: "calendar_events",
      record_id: "1",
      device_id: "d",
      logical_clock: 1,
      updated_at: "2026-09-07T00:00:00Z",
      deleted: false,
      schema_version: 2,
      ciphertext: "x",
      content_hash: "a".repeat(64),
    },
  ]);
  assert.equal(bad.accepted, 0);
  const ok = await syncRelay.pushBlobs("acc", [
    {
      collection: "pending_actions",
      record_id: "mail_reply:1",
      device_id: "d",
      logical_clock: 1,
      updated_at: "2026-09-07T00:00:00Z",
      deleted: false,
      schema_version: 2,
      ciphertext: "x",
      content_hash: "b".repeat(64),
    },
    {
      collection: "nudges",
      record_id: "1",
      device_id: "d",
      logical_clock: 1,
      updated_at: "2026-09-07T00:00:00Z",
      deleted: false,
      schema_version: 2,
      ciphertext: "y",
      content_hash: "c".repeat(64),
    },
    {
      collection: "agent_failures",
      record_id: "9",
      device_id: "d",
      logical_clock: 1,
      updated_at: "2026-09-07T00:00:00Z",
      deleted: false,
      schema_version: 2,
      ciphertext: "z",
      content_hash: "d".repeat(64),
    },
  ]);
  assert.equal(ok.accepted, 3);
});
