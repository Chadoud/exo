process.env.JWT_SECRET = "store-billing-routes-test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { createBillingRouter } = require("../routes/billing");
const { signAccessToken } = require("../lib/tokens");

let n = 0;
function freshAccount() {
  n += 1;
  return `220e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;
}

function authHeaders(accountId) {
  return {
    Authorization: `Bearer ${signAccessToken(accountId)}`,
    "Content-Type": "application/json",
  };
}

function appleJws(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `e30.${body}.sig`;
}

function buildApp(overrides) {
  const app = express();
  app.use(express.json());
  app.use("/v1", createBillingRouter({ storeEnabled: true, enabled: false, ...overrides }));
  return app;
}

test("store verify requires a bearer token", async () => {
  const server = await listenApp(buildApp({ pool: createBillingMockPool() }));
  try {
    const res = await server.fetch("/v1/billing/store/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: "apple", signed_jws: "x.y.z" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("store verify rejects unknown platform and missing payload", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch");
  const server = await listenApp(buildApp({ pool }));
  try {
    const badPlatform = await server.fetch("/v1/billing/store/verify", {
      method: "POST",
      headers: authHeaders(account),
      body: JSON.stringify({ platform: "ios", signed_jws: "x.y.z" }),
    });
    assert.equal(badPlatform.status, 422);
    assert.equal((await badPlatform.json()).detail, "invalid_platform");

    const missing = await server.fetch("/v1/billing/store/verify", {
      method: "POST",
      headers: authHeaders(account),
      body: JSON.stringify({ platform: "apple" }),
    });
    assert.equal(missing.status, 422);
    assert.equal((await missing.json()).detail, "missing_store_payload");
  } finally {
    await server.close();
  }
});

test("store verify happy path ignores client account_id and returns no secrets", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "payer@test.ch");
  const server = await listenApp(
    buildApp({
      pool,
      fetchStoreTruth: async () => ({
        storeOriginalId: "orig-ok",
        productId: "exo.pro.monthly",
        status: "trialing",
        environment: "production",
        expiresAt: "2026-10-11T00:00:00.000Z",
      }),
    }),
  );
  try {
    const res = await server.fetch("/v1/billing/store/verify", {
      method: "POST",
      headers: authHeaders(account),
      body: JSON.stringify({
        platform: "apple",
        signed_jws: appleJws({ originalTransactionId: "orig-ok" }),
        account_id: "attacker",
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.store_checkout_required, false);
    assert.equal(body.signed_jws, undefined);
    assert.equal(body.purchase_token, undefined);
    const extra = JSON.parse(pool.state.entitlements.find((e) => e.source === "app_store").extra);
    assert.equal(extra.signed_jws, undefined);
  } finally {
    await server.close();
  }
});

test("store verify is 503 when store billing is off", async () => {
  const account = freshAccount();
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch");
  const server = await listenApp(buildApp({ pool, storeEnabled: false }));
  try {
    const res = await server.fetch("/v1/billing/store/verify", {
      method: "POST",
      headers: authHeaders(account),
      body: JSON.stringify({ platform: "apple", signed_jws: appleJws({ originalTransactionId: "x" }) }),
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).detail, "store_billing_not_configured");
  } finally {
    await server.close();
  }
});
