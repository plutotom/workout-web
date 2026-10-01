import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const mobileRoot = resolve(import.meta.dirname, "../..");
const swiftAvailable =
  process.platform === "darwin" &&
  spawnSync("xcrun", ["--find", "swiftc"]).status === 0;

describe.skipIf(!swiftAvailable)("Watch native closing lifecycle", () => {
  let directory;
  let executable;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "workout-watch-closing-"));
    executable = join(directory, "watch-closing");
    const source = readFileSync(
      join(mobileRoot, "targets/watch/WorkoutManager.swift"),
      "utf8",
    );
    const start = source.indexOf("  private func requestEnd(");
    const end = source.indexOf("  private func requestAuthorization(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const harness = readFileSync(
      join(mobileRoot, "tests/watch-closing-harness.swift"),
      "utf8",
    ).replace("  // WORKOUT_MANAGER_CLOSING_METHODS", source.slice(start, end));
    const harnessPath = join(directory, "main.swift");
    writeFileSync(harnessPath, harness);
    execFileSync("xcrun", ["swiftc", harnessPath, "-o", executable], {
      encoding: "utf8",
      timeout: 30_000,
    });
  }, 35_000);

  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  function run(scenario) {
    return JSON.parse(
      execFileSync(executable, [scenario], {
        encoding: "utf8",
        timeout: 5_000,
      }),
    );
  }

  it.each([
    "discard-then-end",
    "discard-during-collection",
    "discard-after-collection-callback",
    "repeated-discard",
  ])("discards without saving for %s", (scenario) => {
    const result = run(scenario);
    expect(result).toMatchObject({
      saves: 0,
      discards: 1,
      released: true,
    });
    expect(result.healthUuids.length).toBeGreaterThan(0);
    expect(result.healthUuids.every((uuid) => uuid === "")).toBe(true);
  });

  it.each(["normal-end", "repeated-end"])(
    "saves exactly once for %s",
    (scenario) => {
      const result = run(scenario);
      expect(result).toMatchObject({
        saves: 1,
        discards: 0,
        collections: 1,
        released: true,
      });
      expect(result.healthUuids).toHaveLength(1);
      expect(result.healthUuids[0]).not.toBe("");
    },
  );
});
