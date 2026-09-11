import { describe, expect, it } from "vitest";
import { isStoreSubscriptionSource } from "./subscriptionManagement";

describe("isStoreSubscriptionSource", () => {
  it("treats App Store and Play as store-managed", () => {
    expect(isStoreSubscriptionSource("app_store")).toBe(true);
    expect(isStoreSubscriptionSource("play")).toBe(true);
  });

  it("leaves Stripe and empty sources on the portal path", () => {
    expect(isStoreSubscriptionSource("stripe")).toBe(false);
    expect(isStoreSubscriptionSource(null)).toBe(false);
    expect(isStoreSubscriptionSource(undefined)).toBe(false);
  });
});
