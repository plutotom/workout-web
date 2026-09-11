import { describe, expect, it } from "vitest";

import {
  extractUserIdFromSubscription,
  planFromSubscriptionStatus,
} from "./polar-subscription";

describe("planFromSubscriptionStatus", () => {
  it("treats active and trialing Polar subscriptions as Pro", () => {
    expect(planFromSubscriptionStatus("active")).toBe("pro");
    expect(planFromSubscriptionStatus("trialing")).toBe("pro");
    expect(planFromSubscriptionStatus("canceled")).toBe("free");
    expect(planFromSubscriptionStatus("past_due")).toBe("free");
  });
});

describe("extractUserIdFromSubscription", () => {
  it("prefers customer.metadata.userId from the 2026-04 payload", () => {
    expect(
      extractUserIdFromSubscription({
        customer: {
          metadata: { userId: "user_abc" },
          externalId: "user_other",
        },
      }),
    ).toBe("user_abc");
  });

  it("falls back to Polar customer external id fields", () => {
    expect(
      extractUserIdFromSubscription({
        customer: { externalId: "user_camel" },
      }),
    ).toBe("user_camel");
    expect(
      extractUserIdFromSubscription({
        customer: { external_id: "user_snake" },
      }),
    ).toBe("user_snake");
    expect(extractUserIdFromSubscription({})).toBeNull();
  });
});
