const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

let origFetch;

beforeEach(() => {
  origFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

test("emailFromGraphMePayload prefers mail then UPN", () => {
  delete require.cache[require.resolve("./microsoft.js")];
  const microsoft = require("./microsoft.js");
  assert.equal(microsoft.emailFromGraphMePayload({ mail: "you@contoso.com" }), "you@contoso.com");
  assert.equal(
    microsoft.emailFromGraphMePayload({ userPrincipalName: "you@contoso.com" }),
    "you@contoso.com",
  );
  assert.equal(microsoft.emailFromGraphMePayload({}), undefined);
});

test("graphMeHealth succeeds on 200", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "{}",
  });
  delete require.cache[require.resolve("./microsoft.js")];
  const microsoft = require("./microsoft.js");
  const r = await microsoft.graphMeHealth("token");
  assert.strictEqual(r.ok, true);
});

test("uploadTextToOneDriveRoot sends PUT with content", async () => {
  let calledUrl = "";
  let method = "";
  globalThis.fetch = async (url, init) => {
    calledUrl = String(url);
    method = init?.method ?? "";
    return { ok: true, status: 201, text: async () => "{}" };
  };
  delete require.cache[require.resolve("./microsoft.js")];
  const microsoft = require("./microsoft.js");
  const r = await microsoft.uploadTextToOneDriveRoot("tok", "hello.txt", "hi");
  assert.strictEqual(r.ok, true);
  assert.ok(calledUrl.includes("/me/drive/root:/"));
  assert.ok(calledUrl.includes("hello.txt"));
  assert.strictEqual(method, "PUT");
});
