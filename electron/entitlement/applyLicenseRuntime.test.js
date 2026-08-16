const test = require("node:test");
const assert = require("node:assert/strict");

const calls = [];

function mockModule(id, exports) {
  require.cache[require.resolve(id)] = {
    id: require.resolve(id),
    filename: require.resolve(id),
    loaded: true,
    exports,
  };
}

test.beforeEach(() => {
  calls.length = 0;
  for (const name of [
    "./applyLicenseRuntime",
    "./store",
    "./activateOnline",
    "./machineId",
    "./sortCredentials",
    "../cloudAuth",
    "../backendLifecycle",
    "../syncWorker",
  ]) {
    delete require.cache[require.resolve(name)];
  }
  mockModule("./store", {
    readSavedLicenseKey: () => "exo1.saved.key",
  });
  mockModule("./machineId", {
    getMachineFingerprint: () => "a".repeat(64),
  });
  mockModule("./activateOnline", {
    activateLicenseOnline: async (key, machineId, token) => {
      calls.push(["activate", key, machineId, token]);
      return { ok: true };
    },
    detachOfflineLicenseOnline: async (token) => {
      calls.push(["detach", token]);
      return { ok: true };
    },
  });
  mockModule("../cloudAuth", {
    ensureFreshSession: async () => ({ access_token: "sess-token" }),
  });
  mockModule("../backendLifecycle", {
    restartBackend: async () => {
      calls.push(["restart"]);
    },
  });
  mockModule("./sortCredentials", {
    syncSortCredentialsFromCloud: async (_ud, opts) => {
      calls.push(["creds", opts]);
      return { ok: true };
    },
  });
  mockModule("../syncWorker", {
    clearLastError: () => {
      calls.push(["clearError"]);
    },
    runSyncOnce: async () => {
      calls.push(["sync"]);
    },
  });
});

test("applySavedLicenseToRuntime restarts backend, attaches, refreshes creds, retries sync", async () => {
  const { applySavedLicenseToRuntime } = require("./applyLicenseRuntime");
  await applySavedLicenseToRuntime("/tmp/exo-ud");
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["restart", "activate", "creds", "clearError", "sync"],
  );
  assert.equal(calls[1][3], "sess-token");
  assert.deepEqual(calls[2][1], { force: true });
});

test("revokeSavedLicenseRuntime detaches then restarts", async () => {
  const { revokeSavedLicenseRuntime } = require("./applyLicenseRuntime");
  await revokeSavedLicenseRuntime("/tmp/exo-ud");
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["detach", "restart"],
  );
});
