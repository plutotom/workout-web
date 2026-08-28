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

  it("compiles PCC only against the iOS 27 SDK so Xcode 26 still ships on-device", () => {
    const podspec = readFileSync(
      join(root, "ios/AppleFoundationModels.podspec"),
      "utf8",
    );
    expect(podspec).toContain("WORKOUT_APPLE_PCC");
    expect(podspec).toContain("OTHER_SWIFT_FLAGS[sdk=iphoneos27*]");
    expect(podspec).toContain("OTHER_SWIFT_FLAGS[sdk=iphonesimulator27*]");

    const swift = readFileSync(
      join(root, "ios/AppleFoundationModelsModule.swift"),
      "utf8",
    );
    const withoutPcc = swift
      .replace(/#if WORKOUT_APPLE_PCC[\s\S]*?#endif/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(withoutPcc).not.toMatch(/\bPrivateCloudComputeLanguageModel\b/);
    expect(withoutPcc).not.toMatch(/\bLanguageModelError\b/);
  });
});
