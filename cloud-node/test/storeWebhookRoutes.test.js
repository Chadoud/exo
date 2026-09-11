const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { createBillingMockPool } = require("./helpers/mockBillingPool");
const { createAppleWebhookRouter, createPlayWebhookRouter } = require("../routes/storeWebhooks");

function appleApp(overrides) {
  const app = express();
  app.use(express.json());
  app.use("/v1/webhooks/app-store", createAppleWebhookRouter(overrides));
  return app;
}

test("Apple webhook rejects an invalid signature", async () => {
  const server = await listenApp(
    appleApp({
      verifyAppleSignedJws: async () => {
        const err = new Error("invalid_store_notification");
        err.status = 401;
        throw err;
      },
    }),
  );
  try {
    const res = await server.fetch("/v1/webhooks/app-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedPayload: "bad" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("Apple webhook accepts a verified payload", async () => {
  const pool = createBillingMockPool();
  const server = await listenApp(
    appleApp({
      pool,
      expectLivemode: false,
      verifyAppleSignedJws: async () => ({
        notificationUUID: "route-1",
        notificationType: "SUBSCRIBED",
        data: {
          environment: "Production",
          signedTransactionInfo: `e30.${Buffer.from(JSON.stringify({ originalTransactionId: "unknown" })).toString("base64url")}.sig`,
        },
      }),
      fetchStoreTruth: async () => ({
        storeOriginalId: "unknown",
        productId: "exo.pro.monthly",
        status: "trialing",
        environment: "production",
        expiresAt: "2026-12-01T00:00:00.000Z",
        autoRenew: true,
      }),
    }),
  );
  try {
    const res = await server.fetch("/v1/webhooks/app-store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedPayload: "good.payload.sig" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.handled, "unbound");
  } finally {
    await server.close();
  }
});

test("Play webhook rejects missing OIDC", async () => {
  const app = express();
  app.use(express.json());
  app.use("/v1/webhooks/play", createPlayWebhookRouter({}));
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/v1/webhooks/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { messageId: "m", data: "e30=" } }),
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});
