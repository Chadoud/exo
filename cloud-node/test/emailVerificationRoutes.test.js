const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");
const { signAccessToken } = require("../lib/tokens");

process.env.JWT_SECRET = "email-verification-routes-test-secret";

const ACCOUNT_ID = "acc-verify-1";

function mountAuthRouterWithFakes({ accountEmailVerification = null, sentEmails = [] } = {}) {
  for (const name of ["../routes/auth", "../lib/accounts", "../lib/emailVerification", "../lib/email"]) {
    delete require.cache[require.resolve(name)];
  }

  const accounts = require("../lib/accounts");
  const verifyCalls = [];
  accounts.getAccountEmailVerification = async (accountId) =>
    accountId === ACCOUNT_ID ? accountEmailVerification : null;
  accounts.sendVerificationEmail = async (accountId, email) => {
    verifyCalls.push({ accountId, email });
  };

  const tokens = new Map();
  const emailVerification = require("../lib/emailVerification");
  emailVerification.createVerifyToken = async (accountId) => {
    const token = `verify-token-${accountId}`;
    tokens.set(token, { accountId, consumed: false });
    return token;
  };
  emailVerification.consumeVerifyToken = async (token) => {
    const entry = tokens.get(token);
    if (!entry || entry.consumed) return null;
    entry.consumed = true;
    return entry.accountId;
  };

  const email = require("../lib/email");
  email.sendEmail = async (msg) => {
    sentEmails.push(msg);
    return { sent: true };
  };

  const authRouter = require("../routes/auth");
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  return { app, verifyCalls, tokens };
}

function authHeaders() {
  return { Authorization: `Bearer ${signAccessToken(ACCOUNT_ID)}` };
}

test("GET verify-email renders a confirm button and does NOT consume the token", async () => {
  const { app, tokens } = mountAuthRouterWithFakes();
  tokens.set("good-token", { accountId: ACCOUNT_ID, consumed: false });
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/verify-email?token=good-token");
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Verify your email/);
    assert.match(html, /good-token/);
    // A link-prefetching scanner issuing this exact GET must never burn the token.
    assert.equal(tokens.get("good-token").consumed, false);
  } finally {
    await server.close();
  }
});

test("GET verify-email shows an error state with no token", async () => {
  const { app } = mountAuthRouterWithFakes();
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/verify-email");
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Verification link incomplete/);
  } finally {
    await server.close();
  }
});

test("POST verify-email consumes a valid token", async () => {
  const { app, tokens } = mountAuthRouterWithFakes();
  tokens.set("good-token", { accountId: ACCOUNT_ID, consumed: false });
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "good-token" }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(tokens.get("good-token").consumed, true);

    const replay = await server.fetch("/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "good-token" }),
    });
    assert.equal(replay.status, 401);
  } finally {
    await server.close();
  }
});

test("POST verify-email rejects a missing/invalid token", async () => {
  const { app } = mountAuthRouterWithFakes();
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-real" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("verify-email/resend requires auth", async () => {
  const { app } = mountAuthRouterWithFakes();
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/verify-email/resend", { method: "POST" });
    assert.equal(res.status, 401);
  } finally {
    await server.close();
  }
});

test("verify-email/resend sends a new email when the account is unverified", async () => {
  const sentEmails = [];
  const { app, verifyCalls } = mountAuthRouterWithFakes({
    accountEmailVerification: { email: "user@example.com", emailVerified: false },
    sentEmails,
  });
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/verify-email/resend", { method: "POST", headers: authHeaders() });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(verifyCalls.length, 1);
    assert.equal(verifyCalls[0].accountId, ACCOUNT_ID);
    assert.equal(verifyCalls[0].email, "user@example.com");
  } finally {
    await server.close();
  }
});

test("verify-email/resend is a no-op for an already-verified account", async () => {
  const { app, verifyCalls } = mountAuthRouterWithFakes({
    accountEmailVerification: { email: "user@example.com", emailVerified: true },
  });
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/verify-email/resend", { method: "POST", headers: authHeaders() });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.equal(verifyCalls.length, 0);
  } finally {
    await server.close();
  }
});
