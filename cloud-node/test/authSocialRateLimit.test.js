const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");

process.env.JWT_SECRET = "auth-social-rate-limit-test-secret";

/**
 * Mounts routes/authSocial.js with exchangeCodes faked out, so /auth/exchange
 * is reachable (and cheap to call repeatedly) without a real DB or a
 * completed OAuth handshake — this test only cares whether the rate-limit
 * middleware is actually wired onto the route, not exchange semantics
 * (covered elsewhere).
 */
function mountAuthSocialWithFakes() {
  for (const name of ["../routes/authSocial", "../lib/exchangeCodes"]) {
    delete require.cache[require.resolve(name)];
  }
  const exchangeCodes = require("../lib/exchangeCodes");
  exchangeCodes.consumeExchangeCode = async () => null; // always "invalid code" — no DB needed

  const authSocialRouter = require("../routes/authSocial");
  const app = express();
  app.use(express.json());
  app.use("/auth", authSocialRouter);
  return app;
}

test("social auth routes are rate-limited per IP (exchange)", async () => {
  const app = mountAuthSocialWithFakes();
  const server = await listenApp(app);
  try {
    let lastStatus = 200;
    for (let i = 0; i < 31; i += 1) {
      const res = await server.fetch("/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.20" },
        body: JSON.stringify({ code: "bogus-code" }),
      });
      lastStatus = res.status;
      if (i < 30) {
        assert.equal(res.status, 401, `request ${i} should reach the handler (invalid code)`);
      }
    }
    assert.equal(lastStatus, 429);
  } finally {
    await server.close();
  }
});

test("social auth routes rate-limit independently per IP", async () => {
  const app = mountAuthSocialWithFakes();
  const server = await listenApp(app);
  try {
    const resA = await server.fetch("/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.21" },
      body: JSON.stringify({ code: "bogus-code" }),
    });
    const resB = await server.fetch("/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.22" },
      body: JSON.stringify({ code: "bogus-code" }),
    });
    assert.equal(resA.status, 401);
    assert.equal(resB.status, 401);
  } finally {
    await server.close();
  }
});
