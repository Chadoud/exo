const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");

process.env.JWT_SECRET = "licenses-routes-test-secret";

const MACHINE_A = "a".repeat(64);
const MACHINE_B = "b".repeat(64);

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

async function signTestLicense(sk, licenseConstants, overrides = {}) {
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    license_id: "22222222-2222-4222-8222-222222222222",
    max_seats: 1,
    product: licenseConstants.PRODUCT_SLUG,
    tier: "full",
    ...overrides,
  };
  const { canonicalLicensePayload } = require("../lib/licenseVerify");
  const canonical = canonicalLicensePayload(payload);
  const ed = await import("@noble/ed25519");
  const sig = await ed.signAsync(new TextEncoder().encode(canonical), sk);
  return `${licenseConstants.LICENSE_PREFIX}.${b64url(Buffer.from(canonical, "utf8"))}.${b64url(Buffer.from(sig))}`;
}

/** Mocks the DB pool and swaps in a throwaway signing keypair for the router under test. */
async function mountLicensesRouterWithTestKeypair() {
  for (const name of ["../lib/db", "../lib/licenseConstants", "../lib/licenseVerify", "../lib/licenseActivations", "../routes/licenses"]) {
    delete require.cache[require.resolve(name)];
  }
  const rows = [];
  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.startsWith("select 1 from license_activations")) {
        const [licenseId, machineId] = params;
        const found = rows.some((r) => r.license_id === licenseId && r.machine_id === machineId);
        return [found ? [{ 1: 1 }] : []];
      }
      if (normalized.startsWith("select count(*) as n from license_activations")) {
        const [licenseId] = params;
        return [[{ n: rows.filter((r) => r.license_id === licenseId).length }]];
      }
      if (normalized.startsWith("insert into license_activations")) {
        const [licenseId, machineId] = params;
        rows.push({ license_id: licenseId, machine_id: machineId });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected execute: ${sql}`);
    },
    release() {},
  };
  const db = require("../lib/db");
  db.getPool = () => ({ getConnection: async () => conn });

  const licenseConstants = require("../lib/licenseConstants");
  const ed = await import("@noble/ed25519");
  const sk = ed.utils.randomSecretKey();
  const pk = await ed.getPublicKeyAsync(sk);
  licenseConstants.EMBEDDED_LICENSE_PUBLIC_KEY_HEX = Buffer.from(pk).toString("hex");

  const licensesRouter = require("../routes/licenses");
  const app = express();
  app.use(express.json());
  app.use("/v1", licensesRouter);
  return { app, sk, licenseConstants, rows };
}

test("activates a fresh license for a device", async () => {
  const { app, sk, licenseConstants } = await mountLicensesRouterWithTestKeypair();
  const server = await listenApp(app);
  try {
    const licenseKey = await signTestLicense(sk, licenseConstants);
    const res = await server.fetch("/v1/licenses/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey, machine_id: MACHINE_A }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });
  } finally {
    await server.close();
  }
});

test("re-activating the same device is idempotent", async () => {
  const { app, sk, licenseConstants } = await mountLicensesRouterWithTestKeypair();
  const server = await listenApp(app);
  try {
    const licenseKey = await signTestLicense(sk, licenseConstants);
    const body = { license_key: licenseKey, machine_id: MACHINE_A };
    const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const first = await server.fetch("/v1/licenses/activate", opts);
    const second = await server.fetch("/v1/licenses/activate", opts);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
  } finally {
    await server.close();
  }
});

test("rejects a second device once max_seats is exhausted", async () => {
  const { app, sk, licenseConstants } = await mountLicensesRouterWithTestKeypair();
  const server = await listenApp(app);
  try {
    const licenseKey = await signTestLicense(sk, licenseConstants);
    await server.fetch("/v1/licenses/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey, machine_id: MACHINE_A }),
    });
    const res = await server.fetch("/v1/licenses/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey, machine_id: MACHINE_B }),
    });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.detail, "seat_limit");
  } finally {
    await server.close();
  }
});

test("rejects an invalid signature", async () => {
  const { app, licenseConstants } = await mountLicensesRouterWithTestKeypair();
  const server = await listenApp(app);
  try {
    const ed = await import("@noble/ed25519");
    const otherSk = ed.utils.randomSecretKey();
    const licenseKey = await signTestLicense(otherSk, licenseConstants);
    const res = await server.fetch("/v1/licenses/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey, machine_id: MACHINE_A }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.detail, "invalid_license:sig_verify");
  } finally {
    await server.close();
  }
});

test("rejects a malformed machine_id", async () => {
  const { app, sk, licenseConstants } = await mountLicensesRouterWithTestKeypair();
  const server = await listenApp(app);
  try {
    const licenseKey = await signTestLicense(sk, licenseConstants);
    const res = await server.fetch("/v1/licenses/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey, machine_id: "not-hex" }),
    });
    assert.equal(res.status, 422);
  } finally {
    await server.close();
  }
});
