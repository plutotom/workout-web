import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));

describe("AppleFoundationModels Expo module", () => {
  it("declares the native module Expo autolinking looks for", () => {
    const config = JSON.parse(
      readFileSync(join(root, "expo-module.config.json"), "utf8"),
    );
    expect(config.platforms).toContain("apple");
    expect(config.apple.modules).toEqual(["AppleFoundationModelsModule"]);
  });
});
