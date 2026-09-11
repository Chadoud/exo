const test = require("node:test");
const assert = require("node:assert/strict");
const {
  decodeJwsPayload,
  verifyAppleSignedJws,
  pokeFromAssnPayload,
  fetchAppleSubscriptionTruth,
} = require("../lib/storeApple");

test("verifyAppleSignedJws rejects missing x5c and garbage", async () => {
  await assert.rejects(() => verifyAppleSignedJws("not-a-jws"), (err) => err.status === 401);
  const noX5c = `${Buffer.from(JSON.stringify({ alg: "ES256" })).toString("base64url")}.${Buffer.from("{}").toString("base64url")}.sig`;
  await assert.rejects(() => verifyAppleSignedJws(noX5c), (err) => err.status === 401);
});

test("pokeFromAssnPayload reads originalTransactionId from inner JWS", () => {
  const tx = Buffer.from(
    JSON.stringify({ originalTransactionId: "orig-9", productId: "exo.pro.monthly" }),
  ).toString("base64url");
  const poke = pokeFromAssnPayload({
    notificationUUID: "n1",
    notificationType: "DID_RENEW",
    data: { environment: "Sandbox", signedTransactionInfo: `e30.${tx}.sig` },
  });
  assert.equal(poke.storeOriginalId, "orig-9");
  assert.equal(poke.environment, "sandbox");
  assert.equal(decodeJwsPayload(`e30.${tx}.sig`).productId, "exo.pro.monthly");
});

test("fetchAppleSubscriptionTruth uses live lastTransactions and not the poke status", async () => {
  const tx = Buffer.from(
    JSON.stringify({
      originalTransactionId: "orig-live",
      productId: "exo.pro.monthly",
      expiresDate: Date.parse("2026-12-01T00:00:00.000Z"),
      environment: "Production",
    }),
  ).toString("base64url");
  const renewal = Buffer.from(JSON.stringify({ autoRenewStatus: 1 })).toString("base64url");
  const truth = await fetchAppleSubscriptionTruth(
    { storeOriginalId: "orig-live", environment: "production" },
    {
      apiToken: "t",
      httpRequest: async () => ({
        ok: true,
        status: 200,
        json: {
          data: [
            {
              lastTransactions: [
                { status: 1, signedTransactionInfo: `e30.${tx}.sig`, signedRenewalInfo: `e30.${renewal}.sig` },
              ],
            },
          ],
        },
      }),
    },
  );
  assert.equal(truth.status, "active");
  assert.equal(truth.autoRenew, true);
  assert.equal(truth.storeOriginalId, "orig-live");
});
