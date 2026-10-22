import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const mobileRoot = resolve(import.meta.dirname, "../..");
describe("native Watch snapshots and command identity", () => {
  let directory;
  let executable;
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "workout-watch-snapshot-"));
    executable = join(directory, "snapshot");
    const harness = join(directory, "main.swift");
    copyFileSync(
      join(mobileRoot, "tests/watch-snapshot-harness.swift"),
      harness,
    );
    execFileSync(
      "xcrun",
      [
        "swiftc",
        join(
          mobileRoot,
          "modules/watch-bridge/ios/WatchSessionSnapshotCache.swift",
        ),
        join(mobileRoot, "targets/watch/SessionIdentity.swift"),
        harness,
        "-o",
        executable,
      ],
      { timeout: 30_000 },
    );
  }, 35_000);
  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  const run = (scenario) =>
    JSON.parse(
      execFileSync(executable, [scenario], {
        encoding: "utf8",
        timeout: 5_000,
      }),
    );
  it("retains recording through process restart, stale start and reconnect events", () => {
    expect(run("restart-recording")).toMatchObject({
      status: "recording",
      events: [{ sessionId: "a", status: "recording" }],
    });
  });
  it("retains the saved Health UUID through restart and reordered terminal events", () => {
    const result = run("terminal-order");
    expect(result.status).toBe("ended");
    expect(
      result.events.find((event) => event.type === "ended").healthUuid,
    ).toBe("health-a");
  });
  it("persists locked-device saved evidence through a later empty discard replay", () => {
    expect(run("locked-save")).toEqual({
      events: [
        { type: "ended", sessionId: "a", healthUuid: "", healthSaved: true },
      ],
    });
  });
  it("retains save failure through restart and stale recording/start delivery, then permits retry", () => {
    expect(run("save-retry")).toEqual({
      failed: "saveFailed",
      retry: "saving",
    });
  });
  it("scopes metrics and keeps them out of durable storage", () => {
    const result = run("metrics");
    expect(result.live.filter((event) => event.type === "metrics")).toEqual([
      { type: "metrics", sessionId: "a", heartRate: 110 },
    ]);
    expect(result.afterRestart.every((event) => event.type !== "metrics")).toBe(
      true,
    );
  });
  it("bounds retained history", () => {
    const result = run("bounded-history");
    expect(result.events).toHaveLength(16);
    expect(result.latest).toBe("session-29");
  });
  it("rejects delayed commands for other/closed sessions while supporting legacy phones", () => {
    expect(run("command-ownership")).toEqual({
      matches: true,
      other: false,
      empty: false,
      legacy: true,
      freshStart: true,
      repeatedStart: false,
      lateStart: false,
      emptyStart: false,
    });
  });
});
