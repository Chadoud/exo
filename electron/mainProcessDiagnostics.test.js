const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeError, isBenignBackgroundError } = require("./mainProcessDiagnostics");

test("normalizeError extracts message and stack from Error", () => {
  const err = new Error("boom");
  const out = normalizeError(err);
  assert.equal(out.message, "boom");
  assert.match(String(out.stack), /Error: boom/);
});

test("normalizeError stringifies non-Error values", () => {
  const out = normalizeError("plain failure");
  assert.equal(out.message, "plain failure");
  assert.equal(out.stack, null);
});

test("isBenignBackgroundError matches updater / noble packaging noise", () => {
  assert.equal(
    isBenignBackgroundError("Cannot find package '@noble/ed25519' imported from app.asar"),
    true
  );
  assert.equal(isBenignBackgroundError("crypto_unavailable"), true);
  assert.equal(isBenignBackgroundError("latest.json signature rejected: missing_sig"), true);
  assert.equal(isBenignBackgroundError("write EPIPE"), true);
  assert.equal(isBenignBackgroundError("Something unrelated exploded"), false);
  assert.equal(
    isBenignBackgroundError(
      "sync_master_key_unreadable: Error while decrypting the ciphertext provided to safeStorage.decryptString",
    ),
    true,
  );
});
