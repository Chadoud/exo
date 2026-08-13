const test = require("node:test");
const assert = require("node:assert/strict");

const { activateLicenseOnline } = require("./activateOnline");
// Not destructured in activateOnline.js, so tests can swap this out directly
// instead of fighting the dev repo's bundled integration-config.json fallback.
const cloudAuth = require("../cloudAuth");

const originalCloudBaseUrl = cloudAuth.cloudBaseUrl;
const originalFetch = global.fetch;

test.after(() => {
  global.fetch = originalFetch;
  cloudAuth.cloudBaseUrl = originalCloudBaseUrl;
});

test("posts the license key and machine id, returns ok on 200", async () => {
  cloudAuth.cloudBaseUrl = () => "https://cloud.test";
  let seenUrl = null;
  let seenBody = null;
  global.fetch = async (url, init) => {
    seenUrl = String(url);
    seenBody = JSON.parse(init.body);
    return { ok: true, text: async () => JSON.stringify({ ok: true }) };
  };

  const result = await activateLicenseOnline("exo1.abc.def", "f".repeat(64));
  assert.deepEqual(result, { ok: true });
  assert.equal(seenUrl, "https://cloud.test/v1/licenses/activate");
  assert.deepEqual(seenBody, { license_key: "exo1.abc.def", machine_id: "f".repeat(64) });
});

test("surfaces the server's detail reason on a non-2xx response", async () => {
  cloudAuth.cloudBaseUrl = () => "https://cloud.test";
  global.fetch = async () => ({ ok: false, status: 409, text: async () => JSON.stringify({ detail: "seat_limit" }) });

  const result = await activateLicenseOnline("exo1.abc.def", "f".repeat(64));
  assert.deepEqual(result, { ok: false, reason: "seat_limit" });
});

test("returns network_error when the request throws", async () => {
  cloudAuth.cloudBaseUrl = () => "https://cloud.test";
  global.fetch = async () => {
    throw new TypeError("fetch failed");
  };

  const result = await activateLicenseOnline("exo1.abc.def", "f".repeat(64));
  assert.deepEqual(result, { ok: false, reason: "network_error" });
});

test("returns cloud_url_unset when no cloud URL is configured", async () => {
  cloudAuth.cloudBaseUrl = () => "";
  const result = await activateLicenseOnline("exo1.abc.def", "f".repeat(64));
  assert.deepEqual(result, { ok: false, reason: "cloud_url_unset" });
});
