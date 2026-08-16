const test = require("node:test");
const assert = require("node:assert/strict");

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function freshEmailModule() {
  delete require.cache[require.resolve("../lib/config")];
  delete require.cache[require.resolve("../lib/email")];
  return require("../lib/email");
}

test("sendEmail no-ops with an ALERT when EMAIL_ENABLED is off", async () => {
  await withEnv({ EMAIL_ENABLED: "0", RESEND_API_KEY: "re_test" }, async () => {
    const { sendEmail } = freshEmailModule();
    const result = await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    assert.deepEqual(result, { sent: false });
  });
});

test("sendEmail no-ops with an ALERT when RESEND_API_KEY is missing", async () => {
  await withEnv({ EMAIL_ENABLED: "1", RESEND_API_KEY: "" }, async () => {
    const { sendEmail } = freshEmailModule();
    const result = await sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    assert.deepEqual(result, { sent: false });
  });
});

test("sendEmail calls the Resend client with from/to/subject/html/text when enabled", async () => {
  await withEnv({ EMAIL_ENABLED: "1", RESEND_API_KEY: "re_test", EMAIL_FROM: "Exo <noreply@exosites.ch>" }, async () => {
    const email = freshEmailModule();
    const calls = [];
    email.getResendClient = () => ({
      emails: {
        async send(payload) {
          calls.push(payload);
          return { data: { id: "email_123" }, error: null };
        },
      },
    });
    const result = await email.sendEmail({ to: "a@b.com", subject: "Verify your email", html: "<p>verify</p>", text: "verify" });
    assert.deepEqual(result, { sent: true });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      from: "Exo <noreply@exosites.ch>",
      to: "a@b.com",
      subject: "Verify your email",
      html: "<p>verify</p>",
      text: "verify",
    });
  });
});

test("sendEmail reports sent:false without throwing when Resend returns an error", async () => {
  await withEnv({ EMAIL_ENABLED: "1", RESEND_API_KEY: "re_test" }, async () => {
    const email = freshEmailModule();
    email.getResendClient = () => ({
      emails: {
        async send() {
          return { data: null, error: { message: "invalid_from_address" } };
        },
      },
    });
    const result = await email.sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    assert.deepEqual(result, { sent: false });
  });
});

test("sendEmail reports sent:false without throwing when the client itself throws", async () => {
  await withEnv({ EMAIL_ENABLED: "1", RESEND_API_KEY: "re_test" }, async () => {
    const email = freshEmailModule();
    email.getResendClient = () => ({
      emails: {
        async send() {
          throw new Error("network down");
        },
      },
    });
    const result = await email.sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    assert.deepEqual(result, { sent: false });
  });
});

test("sendEmail reports sent:false instead of throwing when the Resend client can't even be constructed", async () => {
  // Regression: a missing/broken "resend" package (require() throws) must
  // degrade like any other send failure, not bubble up as an uncaught 500
  // in every route that calls sendEmail (forgot-password, verify-email).
  await withEnv({ EMAIL_ENABLED: "1", RESEND_API_KEY: "re_test" }, async () => {
    const email = freshEmailModule();
    email.getResendClient = () => {
      throw new Error("Cannot find module 'resend'");
    };
    await assert.doesNotReject(async () => {
      const result = await email.sendEmail({ to: "a@b.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
      assert.deepEqual(result, { sent: false });
    });
  });
});

test("sendEmail logs a grep-able outcome= line for each terminal state, never logging the recipient", async () => {
  await withEnv({ EMAIL_ENABLED: "0" }, async () => {
    const email = freshEmailModule();
    const logs = [];
    const originalError = console.error;
    console.error = (...args) => logs.push(args.join(" "));
    try {
      await email.sendEmail({ to: "should-not-appear@example.com", subject: "Hi", html: "<p>hi</p>", text: "hi" });
    } finally {
      console.error = originalError;
    }
    assert.equal(logs.length, 1);
    assert.match(logs[0], /outcome=disabled/);
    assert.doesNotMatch(logs[0], /should-not-appear@example\.com/);
  });
});
