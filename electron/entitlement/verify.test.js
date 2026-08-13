const test = require("node:test");
const assert = require("node:assert/strict");

const { verifyLicenseKey, canonicalLicensePayload } = require("./verify");
const { LICENSE_PREFIX, PRODUCT_SLUG } = require("./constants");
const embeddedPublicKey = require("./embeddedPublicKey");

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

/** Mirrors tools/license-keygen/sign.cjs so this test catches drift in either file. */
async function signTestLicense(sk, payloadOverrides = {}) {
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    license_id: "test-license-id",
    max_seats: 1,
    product: PRODUCT_SLUG,
    tier: "full",
    ...payloadOverrides,
  };
  const canonical = canonicalLicensePayload(payload);
  const ed = await import("@noble/ed25519");
  const sig = await ed.signAsync(new TextEncoder().encode(canonical), sk);
  return `${LICENSE_PREFIX}.${b64url(Buffer.from(canonical, "utf8"))}.${b64url(Buffer.from(sig))}`;
}

/** verifyLicenseKey checks against the real embedded key, so swap it in for a throwaway one. */
async function withTestKeypair(t) {
  const ed = await import("@noble/ed25519");
  const sk = ed.utils.randomSecretKey();
  const pk = await ed.getPublicKeyAsync(sk);
  const original = embeddedPublicKey.EMBEDDED_LICENSE_PUBLIC_KEY_HEX;
  embeddedPublicKey.EMBEDDED_LICENSE_PUBLIC_KEY_HEX = Buffer.from(pk).toString("hex");
  t.after(() => {
    embeddedPublicKey.EMBEDDED_LICENSE_PUBLIC_KEY_HEX = original;
  });
  return sk;
}

test("sign.cjs-equivalent output round-trips through verifyLicenseKey", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk);

  // Regression guard: LICENSE_PREFIX must not itself contain the "." join separator,
  // else the produced key gets a stray empty segment and always fails the format check.
  assert.equal(key.split(".").length, 3, `expected exactly 2 dots, got: ${key}`);

  const result = await verifyLicenseKey(key);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.payload.product, PRODUCT_SLUG);
  assert.equal(result.payload.machine_id, undefined);
});

test("verifyLicenseKey rejects the wrong product slug", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk, { product: "not-exo" });
  const result = await verifyLicenseKey(key);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "product");
});

test("verifyLicenseKey rejects a missing license_id", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk, { license_id: "" });
  const result = await verifyLicenseKey(key);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "license_id");
});

test("verifyLicenseKey rejects a non-positive max_seats", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk, { max_seats: 0 });
  const result = await verifyLicenseKey(key);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "max_seats");
});

test("verifyLicenseKey rejects a tampered signature", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk);
  const [prefix, payloadB64, sigB64] = key.split(".");
  const tampered = (sigB64[0] !== "A" ? "A" : "B") + sigB64.slice(1);
  const result = await verifyLicenseKey(`${prefix}.${payloadB64}.${tampered}`);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "sig_verify");
});

test("LICENSE_PREFIX has no trailing dot (would double up the join separator)", () => {
  assert.ok(!LICENSE_PREFIX.endsWith("."), `LICENSE_PREFIX=${JSON.stringify(LICENSE_PREFIX)} must not end with "."`);
});
