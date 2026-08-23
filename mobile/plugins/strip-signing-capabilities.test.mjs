import { describe, expect, it } from "vitest";

import { stripPaidEntitlements } from "./strip-signing-capabilities.js";

describe("stripPaidEntitlements", () => {
  it("removes push and associated-domains keys and keeps HealthKit", () => {
    expect(
      stripPaidEntitlements({
        "aps-environment": "development",
        "com.apple.developer.associated-domains": [
          "applinks:workout.plutotom.com",
        ],
        "com.apple.developer.healthkit": true,
        "com.apple.developer.healthkit.access": [],
      }),
    ).toEqual({
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.access": [],
    });
  });
});
