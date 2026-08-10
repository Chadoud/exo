const test = require("node:test");
const assert = require("node:assert/strict");
const { parseBillingDeepLink, handleBillingDeepLinkUrl } = require("./billingDeepLink");

test("parseBillingDeepLink accepts complete and cancelled", () => {
  assert.deepEqual(parseBillingDeepLink("exo://billing/complete"), { kind: "complete" });
  assert.deepEqual(parseBillingDeepLink("exo://billing/cancelled"), { kind: "cancelled" });
});

test("parseBillingDeepLink rejects other exo urls and junk", () => {
  assert.equal(parseBillingDeepLink("exo://auth/callback?exo_code=x"), null);
  assert.equal(parseBillingDeepLink("exo://billing/other"), null);
  assert.equal(parseBillingDeepLink("https://billing/complete"), null);
  assert.equal(parseBillingDeepLink("not a url"), null);
  assert.equal(parseBillingDeepLink(undefined), null);
});

test("handleBillingDeepLinkUrl ignores non-billing urls", () => {
  assert.equal(handleBillingDeepLinkUrl("exo://auth/callback?exo_code=x"), false);
  assert.equal(handleBillingDeepLinkUrl("garbage"), false);
});
