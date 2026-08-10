const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { createSyncMockPool } = require("./helpers/mockPool");
const { signAccessToken } = require("../lib/tokens");

process.env.JWT_SECRET = "sync-routes-test-secret";

const ACCOUNT = "660e8400-e29b-41d4-a716-446655440001";

function authHeaders() {
  return {
    Authorization: `Bearer ${signAccessToken(ACCOUNT)}`,
    "Content-Type": "application/json",
  };
}

function mountSyncRouterWithMock(mock) {
  delete require.cache[require.resolve("../routes/sync")];
  delete require.cache[require.resolve("../lib/syncRelay")];
  delete require.cache[require.resolve("../lib/db")];
  const db = require("../lib/db");
  db.getPool = () => mock;
  const syncRouter = require("../routes/sync");
  const app = express();
  app.use(express.json());
  app.use("/v1", syncRouter);
  return app;
}

test("sync routes require bearer token", async () => {
  const mock = createSyncMockPool();
  const app = mountSyncRouterWithMock(mock);
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/v1/sync/status");
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("sync push and pull over HTTP", async () => {
  const mock = createSyncMockPool();
  const app = mountSyncRouterWithMock(mock);
  const server = await listenApp(app);
  try {
    const pushRes = await server.fetch("/v1/sync/blobs/push", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        blobs: [
          {
            collection: "conversations",
            record_id: "conv-1",
            device_id: "desktop",
            logical_clock: 4,
            updated_at: "2026-06-16T12:00:00Z",
            schema_version: 2,
            ciphertext: "enc",
            content_hash: "a".repeat(64),
          },
        ],
      }),
    });
    assert.equal(pushRes.status, 200);
    const pushBody = await pushRes.json();
    assert.equal(pushBody.accepted, 1);

    const pullRes = await server.fetch("/v1/sync/blobs/pull?cursor=0&limit=10", {
      headers: authHeaders(),
    });
    assert.equal(pullRes.status, 200);
    const pullBody = await pullRes.json();
    assert.equal(pullBody.blobs.length, 1);
    assert.equal(pullBody.blobs[0].record_id, "conv-1");

    const statusRes = await server.fetch("/v1/sync/status", { headers: authHeaders() });
    assert.equal(statusRes.status, 200);
    const statusBody = await statusRes.json();
    assert.equal(statusBody.blob_count, 1);
  } finally {
    await server.close();
  }
});

test("sync push rejects batches over 500", async () => {
  const mock = createSyncMockPool();
  const app = mountSyncRouterWithMock(mock);
  const server = await listenApp(app);
  try {
    const blobs = Array.from({ length: 501 }, (_, i) => ({
      collection: "tasks",
      record_id: `r-${i}`,
      logical_clock: 1,
      ciphertext: "x",
      content_hash: "y",
    }));
    const res = await server.fetch("/v1/sync/blobs/push", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ blobs }),
    });
    assert.equal(res.status, 400);
  } finally {
    await server.close();
  }
});
