/**
 * Shared HTTP helpers for Apple / Play store calls. Never log URLs that may
 * contain purchase tokens.
 */

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [opts]
 */
async function defaultHttpRequest(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: opts.headers || {},
    body: opts.body,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { ok: res.ok, status: res.status, json };
}

module.exports = { httpError, defaultHttpRequest };
