const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { listenApp } = require("./helpers/httpHarness");

process.env.JWT_SECRET = "auth-password-routes-test-secret";

/**
 * Mounts routes/auth.js with its lib dependencies swapped for in-memory fakes,
 * mirroring the require.cache substitution pattern used in syncRoutes.test.js.
 */
function mountAuthRouterWithFakes({ passwordAccountsByEmail = {}, sentEmails = [] } = {}) {
  for (const name of ["../routes/auth", "../lib/accounts", "../lib/passwordReset", "../lib/email"]) {
    delete require.cache[require.resolve(name)];
  }

  const accounts = require("../lib/accounts");
  accounts.findPasswordAccountByEmail = async (email) => passwordAccountsByEmail[email.trim().toLowerCase()] || null;
  const passwordUpdates = [];
  accounts.setAccountPassword = async (accountId, newPassword) => {
    passwordUpdates.push({ accountId, newPassword });
  };

  const tokens = new Map();
  const passwordReset = require("../lib/passwordReset");
  passwordReset.createResetToken = async (accountId) => {
    const token = `reset-token-${accountId}-${tokens.size}`;
    tokens.set(token, { accountId, consumed: false });
    return token;
  };
  passwordReset.consumeResetToken = async (token) => {
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

  const revokedAccounts = [];
  const refreshTokens = require("../lib/refreshTokens");
  const originalRevoke = refreshTokens.revokeAccountRefreshTokens;
  refreshTokens.revokeAccountRefreshTokens = async (accountId) => {
    revokedAccounts.push(accountId);
  };

  const authRouter = require("../routes/auth");
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  return { app, passwordUpdates, revokedAccounts, tokens, restoreRevoke: () => (refreshTokens.revokeAccountRefreshTokens = originalRevoke) };
}

test("forgot-password returns the same generic message for unknown and known emails", async () => {
  const sentEmails = [];
  const { app } = mountAuthRouterWithFakes({
    passwordAccountsByEmail: { "known@example.com": { id: "acc-1" } },
    sentEmails,
  });
  const server = await listenApp(app);
  try {
    const unknownRes = await server.fetch("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown@example.com" }),
    });
    const knownRes = await server.fetch("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "known@example.com" }),
    });
    const unknownBody = await unknownRes.json();
    const knownBody = await knownRes.json();
    assert.equal(unknownRes.status, 200);
    assert.equal(knownRes.status, 200);
    assert.deepEqual(unknownBody, knownBody);
    // Only the known (password) account actually gets an email.
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].to, "known@example.com");
  } finally {
    await server.close();
  }
});

test("forgot-password page renders an email-entry form", async () => {
  const { app } = mountAuthRouterWithFakes();
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/forgot-password/page");
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Reset your password/);
    assert.match(html, /id="forgot-email"/);
  } finally {
    await server.close();
  }
});

test("reset-password page renders a form when a token is present", async () => {
  const { app } = mountAuthRouterWithFakes();
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/reset-password/page?token=abc123");
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Reset your password/);
    assert.match(html, /abc123/);
  } finally {
    await server.close();
  }
});

test("reset-password page shows an error state with no token", async () => {
  const { app } = mountAuthRouterWithFakes();
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/reset-password/page");
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Reset link incomplete/);
  } finally {
    await server.close();
  }
});

test("reset-password consumes the token, updates the password, and revokes other sessions", async () => {
  const { app, passwordUpdates, revokedAccounts, restoreRevoke } = mountAuthRouterWithFakes({
    passwordAccountsByEmail: { "known@example.com": { id: "acc-1" } },
  });
  const server = await listenApp(app);
  try {
    const forgotRes = await server.fetch("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "known@example.com" }),
    });
    assert.equal(forgotRes.status, 200);

    // The fake createResetToken is deterministic: first token for acc-1 is
    // "reset-token-acc-1-0" (see mountAuthRouterWithFakes).
    const resetRes = await server.fetch("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "reset-token-acc-1-0", password: "new-password-123" }),
    });
    const resetBody = await resetRes.json();
    assert.equal(resetRes.status, 200);
    assert.deepEqual(resetBody, { ok: true });
    assert.equal(passwordUpdates.length, 1);
    assert.equal(passwordUpdates[0].accountId, "acc-1");
    assert.equal(passwordUpdates[0].newPassword, "new-password-123");
    assert.deepEqual(revokedAccounts, ["acc-1"]);

    const replayRes = await server.fetch("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "reset-token-acc-1-0", password: "another-password" }),
    });
    assert.equal(replayRes.status, 401);
  } finally {
    restoreRevoke();
    await server.close();
  }
});

test("reset-password rejects an unknown token without touching the password", async () => {
  const { app, passwordUpdates } = mountAuthRouterWithFakes();
  const server = await listenApp(app);
  try {
    const res = await server.fetch("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-token", password: "new-password-123" }),
    });
    assert.equal(res.status, 401);
    assert.equal(passwordUpdates.length, 0);
  } finally {
    await server.close();
  }
});
