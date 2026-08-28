import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(root, "../..");

describe("AppleFoundationModels Expo module", () => {
  it("declares the native module Expo autolinking looks for", () => {
    const config = JSON.parse(
      readFileSync(join(root, "expo-module.config.json"), "utf8"),
    );
    expect(config.platforms).toContain("apple");
    expect(config.apple.modules).toEqual(["AppleFoundationModelsModule"]);
  });

  it("autolinks into the iOS app so logged-out generate is not a no-op", () => {
    const output = execFileSync(
      "pnpm",
      ["exec", "expo-modules-autolinking", "resolve", "--platform", "ios"],
      { cwd: mobileRoot, encoding: "utf8", timeout: 30_000 },
    );
    expect(output).toContain("apple-foundation-models");
    expect(output).toContain("AppleFoundationModels");
    expect(output).toContain("AppleFoundationModelsModule");
  });
});
