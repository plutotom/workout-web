import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
function method(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing production method: ${signature}`);
  let end = source.indexOf("{", start);
  let depth = 1;
  while (depth && ++end < source.length) {
    if (source[end] === "{") depth++;
    if (source[end] === "}") depth--;
  }
  if (depth) throw new Error(`Unclosed method: ${signature}`);
  return source.slice(start, end + 1);
}

describe("production native Health authorization and recovery", () => {
  let directory;
  let executable;
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "watch-authorization-"));
    executable = join(directory, "authorization");
    const watch = readFileSync(
      join(root, "targets/watch/WorkoutManager.swift"),
      "utf8",
    );
    const phone = readFileSync(
      join(root, "modules/watch-bridge/ios/WatchBridgeModule.swift"),
      "utf8",
    );
    const phoneStart = method(phone, "  func startWatchWorkout(");
    const boundary = phoneStart.indexOf("    guard WCSession.isSupported()");
    if (boundary < 0) throw new Error("Missing phone authorization boundary");
    const harness = readFileSync(
      join(root, "tests/watch-authorization-harness.swift"),
      "utf8",
    )
      .replace(
        "// WATCH_AUTHORIZATION",
        method(watch, "  private func requestAuthorization("),
      )
      .replace("// WATCH_REVIEW", method(watch, "  func reviewHealthAccess("))
      .replace("// WATCH_ATTACH", method(watch, "  private func attach("))
      // Execute the real authorization prefix, stopping before WatchConnectivity
      // I/O. The complete unmodified transport is also Apple SDK typechecked.
      .replace(
        "// PHONE_AUTHORIZATION",
        `${phoneStart.slice(0, boundary)}\n  }`,
      );
    const path = join(directory, "main.swift");
    writeFileSync(path, harness);
    execFileSync(
      "xcrun",
      ["swiftc", "-parse-as-library", path, "-o", executable],
      {
        encoding: "utf8",
        timeout: 30_000,
      },
    );
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
  it.each(["phone", "watch"])(
    "%s requests new metric types after an older workout-only request",
    (scenario) => {
      expect(run(scenario)).toEqual({
        read: ["activeEnergyBurned", "heartRate", "workout"],
        share: ["workout"],
        calls: 1,
      });
    },
  );
  it("surfaces request failure, permits retry, and never treats a read decision as known", () => {
    expect(run("retry")).toEqual({
      failed: true,
      retried: true,
      requesting: false,
      calls: 2,
    });
  });
  it("coalesces overlapping visible-UI and button authorization requests", () => {
    expect(run("overlap")).toEqual({ calls: 1, requesting: false });
  });
  it("reattaches the live data source and delegates to a recovered builder", () => {
    expect(run("recovery")).toEqual({
      attached: true,
      configuration: 42,
      sessionId: "recovered",
    });
  });
});
