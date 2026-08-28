import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  shouldKeepPaidIosEntitlements,
  stripPaidEntitlements,
} from "./strip-signing-capabilities.js";

const appJsonPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../app.json",
);

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
        "com.apple.developer.private-cloud-compute": true,
      }),
    ).toEqual({
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.access": [],
    });
  });

  describe("KEEP_PAID_IOS_ENTITLEMENTS", () => {
    afterEach(() => {
      delete process.env.KEEP_PAID_IOS_ENTITLEMENTS;
    });

    it("strips PCC by default so Personal Team device installs can sign", () => {
      expect(shouldKeepPaidIosEntitlements()).toBe(false);
    });

    it("keeps paid keys including PCC for store / TestFlight prebuild", () => {
      process.env.KEEP_PAID_IOS_ENTITLEMENTS = "1";
      expect(shouldKeepPaidIosEntitlements()).toBe(true);
    });
  });
});

describe("app.json PCC entitlement", () => {
  it("declares PCC so KEEP_PAID_IOS_ENTITLEMENTS builds can overflow on-device 4k", () => {
    const app = JSON.parse(readFileSync(appJsonPath, "utf8"));
    expect(
      app.expo.ios.entitlements["com.apple.developer.private-cloud-compute"],
    ).toBe(true);
  });
});

describe("pnpm ios KEEP_PAID_IOS_ENTITLEMENTS", () => {
  it("skips the Personal Team signing shim so paid-team PCC can stay in the binary", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../scripts/mobile.mjs"),
      "utf8",
    );
    expect(source).toContain('KEEP_PAID_IOS_ENTITLEMENTS === "1"');
    expect(source).toMatch(
      /skipping Personal Team signing shim|keeping Push, Associated Domains, and Private Cloud Compute/,
    );
  });
});
