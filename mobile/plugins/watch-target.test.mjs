import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const root = dirname(fileURLToPath(import.meta.url));
const watchConfig = join(root, "../targets/watch/expo-target.config.js");
const appJson = join(root, "../app.json");

describe("Watch target survives Expo prebuild", () => {
  it("declares a HealthKit watch companion outside ios/", () => {
    const config = require(watchConfig)({
      ios: {
        appleTeamId: "3CVY7K9AJ6",
        bundleIdentifier: "com.isaiahproctor.workout.local",
      },
    });
    expect(config.type).toBe("watch");
    expect(config.bundleIdentifier).toBe(".watchkitapp");
    expect(config.entitlements["com.apple.developer.healthkit"]).toBe(true);
    expect(config.frameworks).toEqual(
      expect.arrayContaining(["HealthKit", "WatchConnectivity"]),
    );
  });

  it("runs apple-targets before the signing plugin so Watch is a signable target", () => {
    const plugins = JSON.parse(readFileSync(appJson, "utf8")).expo.plugins;
    const appleTargets = plugins.indexOf("@bacons/apple-targets");
    const signing = plugins.indexOf("./plugins/strip-signing-capabilities.js");
    expect(appleTargets).toBeGreaterThan(-1);
    expect(signing).toBeGreaterThan(appleTargets);
  });
});
