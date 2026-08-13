const test = require("node:test");
const assert = require("node:assert/strict");

const { verifyLicenseKey, canonicalLicensePayload } = require("../lib/licenseVerify");
const { LICENSE_PREFIX, PRODUCT_SLUG } = require("../lib/licenseConstants");
const licenseConstants = require("../lib/licenseConstants");

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

async function signTestLicense(sk, overrides = {}) {
  const payload = {
    iat: Math.floor(Date.now() / 1000),
    license_id: "11111111-1111-4111-8111-111111111111",
    max_seats: 1,
    product: PRODUCT_SLUG,
    tier: "full",
    ...overrides,
  };
  const canonical = canonicalLicensePayload(payload);
  const ed = await import("@noble/ed25519");
  const sig = await ed.signAsync(new TextEncoder().encode(canonical), sk);
  return `${LICENSE_PREFIX}.${b64url(Buffer.from(canonical, "utf8"))}.${b64url(Buffer.from(sig))}`;
}

async function withTestKeypair(t) {
  const ed = await import("@noble/ed25519");
  const sk = ed.utils.randomSecretKey();
  const pk = await ed.getPublicKeyAsync(sk);
  const original = licenseConstants.EMBEDDED_LICENSE_PUBLIC_KEY_HEX;
  licenseConstants.EMBEDDED_LICENSE_PUBLIC_KEY_HEX = Buffer.from(pk).toString("hex");
  t.after(() => {
    licenseConstants.EMBEDDED_LICENSE_PUBLIC_KEY_HEX = original;
  });
  return sk;
}

test("valid license verifies and has no machine_id in the payload", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk);
  const result = await verifyLicenseKey(key);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.payload.license_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(result.payload.machine_id, undefined);
});

test("rejects wrong product slug", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk, { product: "not-exo" });
  const result = await verifyLicenseKey(key);
  assert.deepEqual([result.ok, result.reason], [false, "product"]);
});

test("rejects missing license_id", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk, { license_id: "" });
  const result = await verifyLicenseKey(key);
  assert.deepEqual([result.ok, result.reason], [false, "license_id"]);
});

test("rejects a tampered signature", async (t) => {
  const sk = await withTestKeypair(t);
  const key = await signTestLicense(sk);
  const [prefix, payloadB64, sigB64] = key.split(".");
  const tampered = (sigB64[0] !== "A" ? "A" : "B") + sigB64.slice(1);
  const result = await verifyLicenseKey(`${prefix}.${payloadB64}.${tampered}`);
  assert.deepEqual([result.ok, result.reason], [false, "sig_verify"]);
});

test("LICENSE_PREFIX has no trailing dot (would double up the join separator)", () => {
  assert.ok(!LICENSE_PREFIX.endsWith("."));
});
