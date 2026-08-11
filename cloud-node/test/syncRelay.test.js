const test = require("node:test");
const assert = require("node:assert/strict");
const { createSyncMockPool } = require("./helpers/mockPool");

process.env.JWT_SECRET = "sync-relay-test-secret";

const ACCOUNT = "550e8400-e29b-41d4-a716-446655440000";

function loadSyncRelayWithMock(mock) {
  delete require.cache[require.resolve("../lib/syncRelay")];
  delete require.cache[require.resolve("../lib/db")];
  const db = require("../lib/db");
  db.getPool = () => mock;
  return require("../lib/syncRelay");
}

function envelope(overrides = {}) {
  return {
    collection: "memory_entries",
    record_id: "mem-1",
    device_id: "dev-a",
    logical_clock: 3,
    updated_at: "2026-06-16T10:00:00Z",
    deleted: false,
    schema_version: 2,
    ciphertext: "cipher-a",
    content_hash: "a".repeat(64),
    ...overrides,
  };
}

test("pushBlobs accepts envelopes and advances change_seq cursor", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  const result = await syncRelay.pushBlobs(ACCOUNT, [envelope()]);
  assert.equal(result.accepted, 1);
  assert.equal(result.feed_version, 1);
  assert.ok(result.cursor >= 1);
  const status = await syncRelay.syncStatus(ACCOUNT);
  assert.equal(status.blob_count, 1);
});

test("pushBlobs ignores stale logical_clock (idempotency)", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  await syncRelay.pushBlobs(ACCOUNT, [
    envelope({ logical_clock: 5, ciphertext: "cipher-new", content_hash: "b".repeat(64) }),
  ]);
  await syncRelay.pushBlobs(ACCOUNT, [
    envelope({
      logical_clock: 2,
      device_id: "dev-b",
      ciphertext: "cipher-stale",
      content_hash: "c".repeat(64),
    }),
  ]);
  const pulled = await syncRelay.pullBlobs(ACCOUNT, 0, 10);
  assert.equal(pulled.blobs.length, 1);
  assert.equal(pulled.blobs[0].ciphertext, "cipher-new");
  assert.equal(pulled.blobs[0].logical_clock, 5);
});

test("pushBlobs lets another device win with a newer logical_clock (task completion)", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  // Desktop pushes the task first…
  await syncRelay.pushBlobs(ACCOUNT, [
    envelope({
      collection: "tasks",
      record_id: "7",
      device_id: "desktop-1",
      logical_clock: 100,
      ciphertext: "cipher-open",
      content_hash: "e".repeat(64),
    }),
  ]);
  // …then the phone pushes a completion with a newer clock.
  const result = await syncRelay.pushBlobs(ACCOUNT, [
    envelope({
      collection: "tasks",
      record_id: "7",
      device_id: "phone-1",
      logical_clock: 200,
      ciphertext: "cipher-done",
      content_hash: "f".repeat(64),
    }),
  ]);
  assert.equal(result.accepted, 1);
  const pulled = await syncRelay.pullBlobs(ACCOUNT, 0, 10);
  const latest = pulled.blobs.at(-1);
  assert.equal(latest.device_id, "phone-1");
  assert.equal(latest.ciphertext, "cipher-done");
});

test("pullBlobs delivers update after cursor (change feed)", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  const first = await syncRelay.pushBlobs(ACCOUNT, [
    envelope({ logical_clock: 1, ciphertext: "v1", content_hash: "d".repeat(64) }),
  ]);
  const page1 = await syncRelay.pullBlobs(ACCOUNT, 0, 10);
  assert.equal(page1.blobs.length, 1);
  assert.equal(page1.blobs[0].ciphertext, "v1");
  assert.equal(page1.cursor, first.cursor);

  await syncRelay.pushBlobs(ACCOUNT, [
    envelope({
      logical_clock: 2,
      ciphertext: "v2",
      content_hash: "e".repeat(64),
      updated_at: "2026-06-16T11:00:00Z",
    }),
  ]);
  const page2 = await syncRelay.pullBlobs(ACCOUNT, page1.cursor, 10);
  assert.equal(page2.blobs.length, 1);
  assert.equal(page2.blobs[0].ciphertext, "v2");
  assert.equal(page2.feed_version, 1);
});

test("pullBlobs paginates after change_seq cursor", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  await syncRelay.pushBlobs(ACCOUNT, [
    envelope({
      collection: "tasks",
      record_id: "t-1",
      logical_clock: 1,
      ciphertext: "c1",
      content_hash: "f".repeat(64),
    }),
    envelope({
      collection: "tasks",
      record_id: "t-2",
      logical_clock: 2,
      ciphertext: "c2",
      content_hash: "0".repeat(64),
      updated_at: "2026-06-16T10:01:00Z",
    }),
  ]);
  const page1 = await syncRelay.pullBlobs(ACCOUNT, 0, 1);
  assert.equal(page1.blobs.length, 1);
  assert.equal(page1.blobs[0].record_id, "t-1");
  assert.equal(page1.has_more, true);
  const page2 = await syncRelay.pullBlobs(ACCOUNT, page1.cursor, 10);
  assert.equal(page2.blobs.length, 1);
  assert.equal(page2.blobs[0].record_id, "t-2");
});

test("pullBlobs behind compaction floor returns sync_blobs snapshot", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  await syncRelay.pushBlobs(ACCOUNT, [
    envelope({ logical_clock: 1, ciphertext: "old", content_hash: "1".repeat(64) }),
  ]);
  await syncRelay.pushBlobs(ACCOUNT, [
    envelope({
      logical_clock: 2,
      ciphertext: "mid",
      content_hash: "2".repeat(64),
      updated_at: "2026-06-16T11:00:00Z",
    }),
  ]);
  await syncRelay.pushBlobs(ACCOUNT, [
    envelope({
      logical_clock: 3,
      ciphertext: "cur",
      content_hash: "3".repeat(64),
      updated_at: "2026-06-16T12:00:00Z",
    }),
  ]);
  // Simulate compaction: drop change_seq < 3 (floor becomes 3).
  await mock.query("DELETE FROM sync_changes WHERE account_id = ? AND change_seq < ?", [
    ACCOUNT,
    3,
  ]);
  const snap = await syncRelay.pullBlobs(ACCOUNT, 1, 10, 0);
  assert.equal(snap.resync_required, true);
  assert.equal(snap.snapshot, true);
  assert.equal(snap.blobs.length, 1);
  assert.equal(snap.blobs[0].ciphertext, "cur");
  assert.equal(snap.resume_cursor, 3);
  assert.equal(snap.has_more, false);
});

test("pushBlobs rejects unknown collection", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  const result = await syncRelay.pushBlobs(ACCOUNT, [
    envelope({ collection: "evil_collection" }),
  ]);
  assert.equal(result.accepted, 0);
  assert.equal(result.rejected, 1);
});

test("registerDevice upserts device row", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  const out = await syncRelay.registerDevice(ACCOUNT, {
    name: "Desktop",
    platform: "darwin",
    pushToken: null,
    deviceId: "device-fixed-id",
  });
  assert.equal(out.device_id, "device-fixed-id");
  const status = await syncRelay.syncStatus(ACCOUNT);
  assert.equal(status.device_count, 1);
});

test("pairing grant redeem binds account, key fingerprint, and is single-use", async () => {
  const mock = createSyncMockPool();
  const syncRelay = loadSyncRelayWithMock(mock);
  const fp = "a".repeat(64);
  const grant = await syncRelay.createPairingGrant(ACCOUNT, fp);
  assert.equal(grant.ok, true);
  assert.ok(grant.grant_token);
  const other = "660e8400-e29b-41d4-a716-446655440099";
  const mismatch = await syncRelay.redeemPairingGrant(other, grant.grant_token, fp);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error, "account_mismatch");
  const badKey = await syncRelay.redeemPairingGrant(ACCOUNT, grant.grant_token, "b".repeat(64));
  assert.equal(badKey.ok, false);
  assert.equal(badKey.error, "key_mismatch");
  const ok = await syncRelay.redeemPairingGrant(ACCOUNT, grant.grant_token, fp);
  assert.equal(ok.ok, true);
  const again = await syncRelay.redeemPairingGrant(ACCOUNT, grant.grant_token, fp);
  assert.equal(again.ok, false);
  assert.equal(again.error, "already_redeemed");
});
