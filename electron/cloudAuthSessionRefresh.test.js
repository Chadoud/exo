"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { describe, it, after, beforeEach } = require("node:test");

const safeStorageMock = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`enc:${value}`, "utf8"),
  decryptString: (buf) => buf.toString("utf8").replace(/^enc:/, ""),
};

const electronStub = {
  safeStorage: safeStorageMock,
  app: {
    isPackaged: false,
    getPath: (name) => {
      if (name === "userData") return os.tmpdir();
      if (name === "home") return os.homedir();
      throw new Error(`unexpected getPath(${name})`);
    },
  },
};

const originalLoad = Module._load;
Module._load = function mockElectron(request, parent, isMain) {
  if (request === "electron") return electronStub;
  return originalLoad(request, parent, isMain);
};

function makeJwt(expSecondsFromNow) {
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = Buffer.from(JSON.stringify({ exp }), "utf8").toString("base64url");
  return `hdr.${payload}.sig`;
}

/** Write session in the encrypted on-disk format (M2.6 — plaintext is refused). */
function writeEncSession(userData, session) {
  fs.mkdirSync(userData, { recursive: true });
  const payload = { v: 1, ...session };
  const enc = safeStorageMock.encryptString(JSON.stringify(payload));
  fs.writeFileSync(
    path.join(userData, "cloud_session.json"),
    JSON.stringify({ __enc: true, data: enc.toString("base64") }),
    "utf8",
  );
}

function readStoredSession(userData) {
  const raw = JSON.parse(fs.readFileSync(path.join(userData, "cloud_session.json"), "utf8"));
  if (raw && raw.__enc === true) {
    return JSON.parse(safeStorageMock.decryptString(Buffer.from(raw.data, "base64")));
  }
  return raw;
}

function loadCloudAuth() {
  delete require.cache[require.resolve("./cloudAuth")];
  return require("./cloudAuth");
}

describe("ensureFreshSession refresh single-flight", () => {
  const prevCloudUrl = process.env.EXOSITES_CLOUD_URL;
  const originalFetch = global.fetch;
  let userData = "";
  let refreshCalls = 0;

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), "exo-cloud-auth-"));
    refreshCalls = 0;
    process.env.EXOSITES_CLOUD_URL = "https://api.test.exosites.ch";
  });

  after(() => {
    global.fetch = originalFetch;
    Module._load = originalLoad;
    if (prevCloudUrl === undefined) delete process.env.EXOSITES_CLOUD_URL;
    else process.env.EXOSITES_CLOUD_URL = prevCloudUrl;
  });

  it("returns cached session when access token is still valid", async () => {
    writeEncSession(userData, {
      access_token: makeJwt(3600),
      refresh_token: "rt-valid",
      email: "user@test.com",
    });
    global.fetch = async () => {
      throw new Error("refresh should not run");
    };
    const cloudAuth = loadCloudAuth();
    cloudAuth.resetRefreshInFlightForTests();
    const session = await cloudAuth.ensureFreshSession(userData);
    assert.equal(session?.email, "user@test.com");
    assert.equal(refreshCalls, 0);
  });

  it("dedupes concurrent refresh calls into one POST", async () => {
    writeEncSession(userData, {
      access_token: makeJwt(30),
      refresh_token: "rt-old",
      email: "user@test.com",
    });
    global.fetch = async (url, init) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 40));
        assert.equal(JSON.parse(String(init.body)).refresh_token, "rt-old");
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              access_token: makeJwt(3600),
              refresh_token: "rt-new",
            }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const cloudAuth = loadCloudAuth();
    cloudAuth.resetRefreshInFlightForTests();
    const [a, b, c] = await Promise.all([
      cloudAuth.ensureFreshSession(userData),
      cloudAuth.ensureFreshSession(userData),
      cloudAuth.ensureFreshSession(userData),
    ]);
    assert.equal(refreshCalls, 1);
    assert.equal(a?.access_token, b?.access_token);
    assert.equal(b?.access_token, c?.access_token);
    const stored = readStoredSession(userData);
    assert.equal(stored.refresh_token, "rt-new");
  });

  it("keeps session on transient refresh failure", async () => {
    writeEncSession(userData, {
      access_token: makeJwt(30),
      refresh_token: "rt-old",
      email: "user@test.com",
    });
    global.fetch = async (url) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshCalls += 1;
        throw new TypeError("fetch failed");
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const cloudAuth = loadCloudAuth();
    cloudAuth.resetRefreshInFlightForTests();
    const session = await cloudAuth.ensureFreshSession(userData);
    assert.equal(refreshCalls, 1);
    assert.equal(session?.refresh_token, "rt-old");
    assert.ok(fs.existsSync(path.join(userData, "cloud_session.json")));
  });

  it("uses session written by concurrent refresh instead of clearing on 401", async () => {
    writeEncSession(userData, {
      access_token: makeJwt(30),
      refresh_token: "rt-old",
      email: "user@test.com",
    });
    global.fetch = async (url) => {
      if (String(url).endsWith("/auth/refresh")) {
        refreshCalls += 1;
        writeEncSession(userData, {
          access_token: makeJwt(3600),
          refresh_token: "rt-new",
          email: "user@test.com",
        });
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ detail: "Invalid refresh token" }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const cloudAuth = loadCloudAuth();
    cloudAuth.resetRefreshInFlightForTests();
    const session = await cloudAuth.ensureFreshSession(userData);
    assert.equal(refreshCalls, 1);
    assert.equal(session?.refresh_token, "rt-new");
    assert.ok(fs.existsSync(path.join(userData, "cloud_session.json")));
  });
});

describe("readSession encrypted blob", () => {
  let userData = "";

  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), "exo-cloud-auth-keep-"));
  });

  it("does not delete an encrypted session when safeStorage is not ready", () => {
    writeEncSession(userData, { access_token: "tok", refresh_token: "rt" });
    const prev = safeStorageMock.isEncryptionAvailable;
    safeStorageMock.isEncryptionAvailable = () => false;
    try {
      const cloudAuth = loadCloudAuth();
      assert.equal(cloudAuth.readSession(userData), null);
      assert.ok(fs.existsSync(path.join(userData, "cloud_session.json")));
    } finally {
      safeStorageMock.isEncryptionAvailable = prev;
    }
  });
});
