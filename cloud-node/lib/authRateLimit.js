/** Rate limiting for auth endpoints (register/login). */

const { allow } = require("./rateLimit");

const WINDOW_MS = 15 * 60 * 1000;

/** Per-action max events per IP per WINDOW_MS. */
const ACTION_MAX = {
  register: 8,
  login: 20,
  refresh: 60,
  license_activate: 30,
};

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return String(req.ip || "unknown").slice(0, 64);
}

/**
 * @param {"register"|"login"|"refresh"|"license_activate"} action
 */
function authRateLimitMiddleware(action) {
  const max = ACTION_MAX[action] ?? ACTION_MAX.login;
  return (req, res, next) => {
    const key = `auth:${action}:${clientIp(req)}`;
    if (!allow(key, max, WINDOW_MS)) {
      return res.status(429).json({ detail: "rate_limit_exceeded" });
    }
    return next();
  };
}

module.exports = { authRateLimitMiddleware, clientIp };
