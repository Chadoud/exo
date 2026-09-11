const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePlayRtdnData, verifyPlayOidc, fetchPlaySubscriptionTruth } = require("../lib/storePlay");

test("parsePlayRtdnData reads subscription notification and ignores one-off products", () => {
  const sub = Buffer.from(
    JSON.stringify({
      packageName: "ch.exosites.exosites_mobile",
      subscriptionNotification: {
        notificationType: 2,
        purchaseToken: "tok-1",
        subscriptionId: "exo.pro.monthly",
      },
    }),
  ).toString("base64");
  const parsed = parsePlayRtdnData(sub);
  assert.equal(parsed.ignored, false);
  assert.equal(parsed.purchaseToken, "tok-1");
  assert.equal(parsed.productId, "exo.pro.monthly");

  const oneOff = Buffer.from(JSON.stringify({ oneTimeProductNotification: { sku: "x" } })).toString("base64");
  assert.equal(parsePlayRtdnData(oneOff).ignored, true);
});

test("verifyPlayOidc rejects a missing or garbage bearer", async () => {
  await assert.rejects(() => verifyPlayOidc(""), (err) => err.status === 401);
  await assert.rejects(() => verifyPlayOidc("Bearer nope"), (err) => err.status === 401);
});

test("fetchPlaySubscriptionTruth maps Play state and prefers linkedPurchaseToken", async () => {
  const truth = await fetchPlaySubscriptionTruth(
    { purchaseToken: "latest-token", packageName: "ch.exosites.exosites_mobile" },
    {
      accessToken: "t",
      httpRequest: async () => ({
        ok: true,
        status: 200,
        json: {
          subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
          linkedPurchaseToken: "orig-token",
          lineItems: [
            {
              productId: "exo.pro.monthly",
              expiryTime: "2026-12-01T00:00:00.000Z",
              autoRenewingPlan: { autoRenewEnabled: true },
            },
          ],
        },
      }),
    },
  );
  assert.equal(truth.storeOriginalId, "orig-token");
  assert.equal(truth.status, "past_due");
  assert.equal(truth.environment, "production");
});
