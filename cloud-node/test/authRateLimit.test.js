const test = require("node:test");
const assert = require("node:assert/strict");
const { authRateLimitMiddleware } = require("../lib/authRateLimit");

function mockReq(ip = "203.0.113.10") {
  return { ip, headers: {} };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function exerciseBucket(action, max, ip) {
  const middleware = authRateLimitMiddleware(action);
  const req = mockReq(ip);
  let nextCount = 0;
  const next = () => {
    nextCount += 1;
  };

  for (let i = 0; i < max; i += 1) {
    const res = mockRes();
    middleware(req, res, next);
    assert.equal(res.statusCode, 200, `${action} request ${i} should be allowed`);
  }
  const blocked = mockRes();
  middleware(req, blocked, next);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.detail, "rate_limit_exceeded");
  assert.equal(nextCount, max);
}

test("auth rate limit allows first requests then blocks", () => {
  exerciseBucket("register", 8, "203.0.113.10");
});

test("social auth bucket (start/callback/exchange) has its own limit", () => {
  exerciseBucket("social", 30, "203.0.113.11");
});

test("password_reset bucket (forgot/reset endpoints) has its own limit", () => {
  exerciseBucket("password_reset", 10, "203.0.113.12");
});

test("verify_email bucket (verify/resend endpoints) has its own limit", () => {
  exerciseBucket("verify_email", 10, "203.0.113.13");
});

test("unknown action falls back to the login limit instead of throwing", () => {
  exerciseBucket("not_a_real_action", 20, "203.0.113.14");
});
