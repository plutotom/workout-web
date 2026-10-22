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
    const start = source.indexOf("  func endFromPhone(");
    const end = source.indexOf("  private func requestAuthorization(", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    function method(signature) {
      const begin = source.indexOf(signature);
      if (begin < 0) throw new Error(`Missing production method: ${signature}`);
      let finish = source.indexOf("{", begin),
        depth = 1;
      while (depth && ++finish < source.length) {
        if (source[finish] === "{") depth++;
        if (source[finish] === "}") depth--;
      }
      if (depth) throw new Error("Unclosed production method");
      return source.slice(begin, finish + 1);
    }
    const opening = [
      "  func recoverIfNeeded(",
      "  func retryWorkoutOperation(",
      "  func startFromPhone(",
      "  func replyToStatus(",
      "  private func start(",
      "  private func attach(",
    ]
      .map(method)
      .join("\n");
    const harness = readFileSync(
      join(mobileRoot, "tests/watch-closing-harness.swift"),
      "utf8",
    )
      .replace("  // WORKOUT_MANAGER_CLOSING_METHODS", source.slice(start, end))
      .replace("  // WORKOUT_MANAGER_OPENING_METHODS", opening);
    const harnessPath = join(directory, "main.swift");
    writeFileSync(harnessPath, harness);
    execFileSync(
      "xcrun",
      [
        "swiftc",
        join(mobileRoot, "targets/watch/SessionIdentity.swift"),
        harnessPath,
        "-o",
        executable,
      ],
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

  it("does not end a different workout when an old command is delivered", () => {
    expect(run("foreign-end")).toMatchObject({
      saves: 0,
      discards: 0,
      endCalls: 0,
      healthSessions: ["old-session"],
    });
  });

  it("rejects a queued start when Finish arrives before Start", () => {
    expect(run("finish-before-start")).toMatchObject({
      saves: 0,
      endCalls: 0,
      lateStartAllowed: false,
    });
  });

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

  it.each([
    "recovery-discard",
    "recovery-finish",
    "recovery-error",
    "recovery-crash",
  ])("defers closure until recovery resolves (%s)", (scenario) => {
    const result = run(scenario);
    expect(result).toMatchObject({
      ackBeforeRecovery: false,
      endCalls: 1,
      released: true,
    });
    expect(result.saves).toBe(scenario === "recovery-finish" ? 1 : 0);
    expect(result.discards).toBe(scenario === "recovery-finish" ? 0 : 1);
    if (scenario === "recovery-error")
      expect(result).toMatchObject({
        ackAfterError: false,
        recoveryErrorVisible: true,
        recoveryCalls: 2,
      });
    else expect(result.recoveryCalls).toBe(1);
  });
  it.each(["start-during-finalization", "stale-save-callback"])(
    "retains ownership and rejects obsolete callbacks (%s)",
    (scenario) => {
      expect(run(scenario)).toMatchObject({
        oldRetainedWhileClosing: true,
        saves: 1,
        savedCount: 1,
        newSessionId: "next-session",
        newSaves: 0,
        newRetained: true,
      });
    },
  );
  it("ignores an obsolete collection callback after an explicit retry", () => {
    expect(run("stale-collection-retry")).toMatchObject({
      savesBeforeCurrentCallback: 0,
      collections: 2,
      savedCount: 1,
      released: true,
    });
  });
  it("resolves a recovery retry with no active workout to idle", () => {
    expect(run("recovery-no-active-after-error")).toMatchObject({
      status: "idle",
      errorCleared: true,
    });
  });
  it("coalesces starts until recovery and applies an intervening close first", () => {
    expect(run("recovery-start-and-close")).toMatchObject({
      queuedStartCount: 1,
      createdBeforeRecovery: false,
      saves: 0,
      status: "idle",
      lateStartAllowed: false,
    });
  });
  it("keeps a failed Health save retryable without a false terminal acknowledgement", () => {
    expect(run("save-failure")).toMatchObject({
      failedStatus: "saveFailed",
      failureVisible: true,
      endedBeforeRetry: false,
      released: false,
      savedCount: 0,
      healthUuids: [],
      lateStartAllowed: true,
    });
  });
  it("retries the same builder after save failure without ending collection again", () => {
    expect(run("save-retry")).toMatchObject({
      endedBeforeRetry: false,
      collections: 1,
      saves: 2,
      savedCount: 1,
      newSessionId: "next-session",
    });
  });
  it("permits explicit discard after a failed save", () => {
    expect(run("discard-save-failure")).toMatchObject({
      savedCount: 0,
      discards: 1,
      released: true,
      healthSaved: [false],
    });
  });
  it("does not call finishWorkout when endCollection fails", () => {
    expect(run("collection-failure")).toMatchObject({
      failedStatus: "saveFailed",
      failureVisible: true,
      saves: 0,
      released: false,
      healthUuids: [],
    });
  });
  it("retries failed collection with the original end date", () => {
    expect(run("collection-retry")).toMatchObject({
      collections: 2,
      savesBeforeRetry: 0,
      savedCount: 1,
      sameEndDate: true,
      released: true,
    });
  });
  it("replays successful locked-device saves separately from a discard", () => {
    expect(run("locked-success")).toMatchObject({
      savedCount: 1,
      savedMarker: true,
      status: "ended",
      released: true,
      healthUuids: ["", ""],
      healthSaved: [true, true],
    });
  });
  it("retains a visible failed-save journal when the ended builder cannot be recovered", () => {
    expect(run("recovery-lost-failed-builder")).toMatchObject({
      failureVisible: true,
      failedStatus: "saveFailed",
      ackBeforeDiscard: false,
      healthSaved: [false],
      status: "idle",
    });
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
