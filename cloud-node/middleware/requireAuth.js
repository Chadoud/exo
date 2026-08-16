const { decodeToken } = require("../lib/tokens");
const { optionalAuth } = require("./optionalAuth");

/** Require Bearer access token; sets req.accountId */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({ detail: "missing_token" });
  }
  const token = header.slice(7).trim();
  const payload = decodeToken(token);
  if (!payload || payload.token_use !== "access" || !payload.sub) {
    return res.status(401).json({ detail: "invalid_token" });
  }
  req.accountId = String(payload.sub);
  return next();
}

module.exports = { requireAuth, optionalAuth };
