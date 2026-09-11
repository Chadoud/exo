process.env.JWT_SECRET = "me-routes-test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { signAccessToken } = require("../lib/tokens");

function mountMe(pool) {
  delete require.cache[require.resolve("../lib/db")];
  delete require.cache[require.resolve("../lib/accounts")];
  delete require.cache[require.resolve("../lib/userProfile")];
  delete require.cache[require.resolve("../lib/storeCheckout")];
  delete require.cache[require.resolve("../lib/productAdmins")];
  delete require.cache[require.resolve("../routes/me")];
  require("../lib/db").getPool = () => pool;
  return require("../routes/me");
}

test("GET /v1/me includes store_checkout_required and work_role", async () => {
  const account = "330e8400-e29b-41d4-a716-446655440001";
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch");
  const app = express();
  app.use(express.json());
  app.use("/v1", mountMe(pool));
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/v1/me", {
      headers: { Authorization: `Bearer ${signAccessToken(account)}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.store_checkout_required, "boolean");
    assert.equal(body.profile.work_role, null);
    assert.equal(body.store_billing_exempt, false);
    assert.equal(body.subscription_source, null);
    assert.deepEqual(body.subscription_management, { destination: null, url: null });
    assert.equal(body.store_subscription_survives_deletion, false);
  } finally {
    await server.close();
  }
});

test("PATCH /v1/me writes display_name and work_role only", async () => {
  const account = "330e8400-e29b-41d4-a716-446655440002";
  const pool = createBillingMockPool();
  pool.addAccount(account, "user@test.ch");
  const app = express();
  app.use(express.json());
  app.use("/v1", mountMe(pool));
  const server = await listenApp(app);
  try {
    const ok = await server.fetch("/v1/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${signAccessToken(account)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ display_name: "Ada", work_role: "founder" }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.profile.display_name, "Ada");
    assert.equal(body.profile.work_role, "founder");

    const badRole = await server.fetch("/v1/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${signAccessToken(account)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ work_role: "operations" }),
    });
    assert.equal(badRole.status, 422);
    assert.equal((await badRole.json()).detail, "invalid_work_role");

    const forbidden = await server.fetch("/v1/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${signAccessToken(account)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ store_billing_exempt: 1 }),
    });
    assert.equal(forbidden.status, 422);
  } finally {
    await server.close();
  }
});
