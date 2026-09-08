const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveProfileRoot, setActiveProfileId } = require("./accountProfile");
const {
  readPrefs,
  ensureSyncOn,
  getSyncStatus,
  startSyncWorker,
  stopSyncWorker,
  runSyncOnce,
  normalizePullCursor,
  lastErrorFromSyncRun,
} = require("./syncWorker");

function deviceWithPrefs(prefs) {
  const deviceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-worker-"));
  setActiveProfileId(deviceRoot, "guest");
  const profileRoot = resolveProfileRoot(deviceRoot);
  fs.mkdirSync(profileRoot, { recursive: true });
  if (prefs) {
    fs.writeFileSync(path.join(profileRoot, "sync_prefs.json"), JSON.stringify(prefs), "utf8");
  }
  return { deviceRoot, profileRoot };
}

function withInsecureLocal(fn) {
  const prev = process.env.EXOSITES_INSECURE_LOCAL;
  process.env.EXOSITES_INSECURE_LOCAL = "1";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.EXOSITES_INSECURE_LOCAL;
    else process.env.EXOSITES_INSECURE_LOCAL = prev;
  }
}

test("readPrefs returns defaults when file missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-worker-"));
  const prefs = readPrefs(dir);
  assert.equal(prefs.enabled, true);
  assert.equal(prefs.deviceName, "Desktop");
});

test("ensureSyncOn turns existing off prefs on", () => {
  withInsecureLocal(() => {
    const { profileRoot } = deviceWithPrefs({ enabled: false, deviceId: "dev-off" });
    const prefs = ensureSyncOn(profileRoot);
    assert.equal(prefs.enabled, true);
    assert.equal(prefs.deviceId, "dev-off");
    assert.equal(readPrefs(profileRoot).enabled, true);
  });
});

test("getSyncStatus reports prefs.enabled, not in-memory lastStatus", () => {
  const { deviceRoot } = deviceWithPrefs({
    enabled: true,
    deviceId: "dev-123",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
  });
  const status = getSyncStatus(deviceRoot);
  assert.equal(status.enabled, true);
  assert.equal(status.lastSuccessfulSyncAt, "2026-01-01T00:00:00.000Z");
  assert.equal(status.lastRunAt, "2026-01-01T00:00:00.000Z");
});

test("startSyncWorker persists enabled true", () => {
  withInsecureLocal(() => {
    const { deviceRoot, profileRoot } = deviceWithPrefs({ enabled: false, deviceId: "dev-start" });
    startSyncWorker(deviceRoot);
    stopSyncWorker();
    assert.equal(readPrefs(profileRoot).enabled, true);
    assert.equal(getSyncStatus(deviceRoot).enabled, true);
  });
});

test("runSyncOnce records lastError instead of throwing when the key is unreadable", async () => {
  const prev = process.env.EXOSITES_INSECURE_LOCAL;
  const prevUrl = process.env.EXOSITES_CLOUD_URL;
  delete process.env.EXOSITES_INSECURE_LOCAL;
  process.env.EXOSITES_CLOUD_URL = "https://example.invalid";
  try {
    const { deviceRoot, profileRoot } = deviceWithPrefs({ enabled: true, deviceId: "dev-run" });
    fs.writeFileSync(path.join(profileRoot, "sync_master_key.enc"), "junk", "utf8");
    const status = await runSyncOnce(deviceRoot);
    assert.match(String(status.lastError || ""), /sync_master_key_unreadable|unavailable/i);
  } finally {
    if (prev === undefined) delete process.env.EXOSITES_INSECURE_LOCAL;
    else process.env.EXOSITES_INSECURE_LOCAL = prev;
    if (prevUrl === undefined) delete process.env.EXOSITES_CLOUD_URL;
    else process.env.EXOSITES_CLOUD_URL = prevUrl;
  }
});

test("ensureSyncOn probes the key when prefs are already on", () => {
  const prev = process.env.EXOSITES_INSECURE_LOCAL;
  delete process.env.EXOSITES_INSECURE_LOCAL;
  try {
    const { deviceRoot, profileRoot } = deviceWithPrefs({
      enabled: true,
      deviceId: "dev-already",
    });
    fs.writeFileSync(path.join(profileRoot, "sync_master_key.enc"), "junk", "utf8");
    assert.throws(() => ensureSyncOn(profileRoot), /sync_master_key_unreadable|unavailable/i);
    startSyncWorker(deviceRoot);
    stopSyncWorker();
    assert.match(String(getSyncStatus(deviceRoot).lastError || ""), /sync_master_key_unreadable|unavailable/i);
  } finally {
    if (prev === undefined) delete process.env.EXOSITES_INSECURE_LOCAL;
    else process.env.EXOSITES_INSECURE_LOCAL = prev;
  }
});

test("ensureSyncOn clears lastError after a key failure", () => {
  const prev = process.env.EXOSITES_INSECURE_LOCAL;
  delete process.env.EXOSITES_INSECURE_LOCAL;
  try {
    const { deviceRoot, profileRoot } = deviceWithPrefs({ enabled: false, deviceId: "dev-err" });
    fs.writeFileSync(path.join(profileRoot, "sync_master_key.enc"), "junk", "utf8");
    startSyncWorker(deviceRoot);
    stopSyncWorker();
    const failed = getSyncStatus(deviceRoot);
    assert.match(String(failed.lastError || ""), /sync_master_key_unreadable|unavailable/i);
    withInsecureLocal(() => {
      ensureSyncOn(profileRoot);
      const ok = getSyncStatus(deviceRoot);
      assert.equal(ok.enabled, true);
      assert.equal(ok.lastError, null);
    });
  } finally {
    if (prev === undefined) delete process.env.EXOSITES_INSECURE_LOCAL;
    else process.env.EXOSITES_INSECURE_LOCAL = prev;
  }
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
