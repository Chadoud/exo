const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readPrefs, normalizePullCursor, lastErrorFromSyncRun } = require("./syncWorker");

test("readPrefs returns defaults when file missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-worker-"));
  const prefs = readPrefs(dir);
  assert.equal(prefs.enabled, false);
  assert.equal(prefs.deviceName, "Desktop");
});

test("readPrefs loads persisted json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-worker-"));
  fs.writeFileSync(
    path.join(dir, "sync_prefs.json"),
    JSON.stringify({ enabled: true, deviceId: "dev-123", deviceName: "Laptop" }),
    "utf8",
  );
  const prefs = readPrefs(dir);
  assert.equal(prefs.enabled, true);
  assert.equal(prefs.deviceId, "dev-123");
  assert.equal(prefs.deviceName, "Laptop");
});

test("readPrefs round-trips pullCursor", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-worker-"));
  fs.writeFileSync(
    path.join(dir, "sync_prefs.json"),
    JSON.stringify({ enabled: true, deviceId: "dev-123", pullCursor: 502 }),
    "utf8",
  );
  assert.equal(readPrefs(dir).pullCursor, 502);
});

test("normalizePullCursor coerces to a non-negative integer", () => {
  assert.equal(normalizePullCursor(42), 42);
  assert.equal(normalizePullCursor("17"), 17);
  assert.equal(normalizePullCursor(3.9), 3);
  assert.equal(normalizePullCursor(undefined), 0);
  assert.equal(normalizePullCursor(null), 0);
  assert.equal(normalizePullCursor(-5), 0);
  assert.equal(normalizePullCursor("junk"), 0);
  assert.equal(normalizePullCursor(Infinity), 0);
});

test("lastErrorFromSyncRun keeps pull session_expired when push still ok", () => {
  assert.equal(lastErrorFromSyncRun({ ok: true, pull: { applied: 1 } }), null);
  assert.equal(
    lastErrorFromSyncRun({ ok: true, pull: { error: "session_expired" } }),
    "session_expired",
  );
  assert.equal(lastErrorFromSyncRun({ ok: false, error: "sync_push_failed" }), "sync_push_failed");
});
