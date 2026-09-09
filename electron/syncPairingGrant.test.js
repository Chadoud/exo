const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PAIRING_DEBOUNCE_MS,
  PAIRING_EXPIRY_SKEW_MS,
  canReusePairingGrant,
  rememberPairingGrant,
} = require("./syncPairingGrant");

function grant(overrides = {}) {
  const issued = Date.parse("2026-09-08T12:00:00.000Z");
  const expires = issued + 30 * 60 * 1000;
  return rememberPairingGrant({
    v: 2,
    master_key_b64: "key",
    account_id: "acc-1",
    grant_token: "tok",
    issued_at: new Date(issued).toISOString(),
    expires_at: new Date(expires).toISOString(),
    ...overrides,
  });
}

test("copy reuses a live grant so clipboard matches the QR", () => {
  const cache = grant();
  const now = Date.parse("2026-09-08T12:01:00.000Z");
  assert.equal(
    canReusePairingGrant(cache, { now, force: false, masterKeyB64: "key", accountId: "acc-1" }),
    true,
  );
});

test("force remint is debounced so a second fetch within a minute reuses", () => {
  const cache = grant();
  const now = Date.parse("2026-09-08T12:00:30.000Z");
  assert.equal(canReusePairingGrant(cache, { now, force: true }), true);
  const later = now + PAIRING_DEBOUNCE_MS;
  assert.equal(canReusePairingGrant(cache, { now: later, force: true }), false);
});

test("does not reuse when the grant is inside the expiry skew", () => {
  const cache = grant();
  const expiresAtMs = cache.expiresAtMs;
  const now = expiresAtMs - PAIRING_EXPIRY_SKEW_MS;
  assert.equal(canReusePairingGrant(cache, { now, force: false }), false);
});

test("does not reuse after key or account change", () => {
  const cache = grant();
  const now = Date.parse("2026-09-08T12:01:00.000Z");
  assert.equal(canReusePairingGrant(cache, { now, masterKeyB64: "other" }), false);
  assert.equal(canReusePairingGrant(cache, { now, accountId: "other" }), false);
});
