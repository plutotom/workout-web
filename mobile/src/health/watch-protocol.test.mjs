import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
describe("durable native Watch start admission", () => {
  let directory, executable;
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), "watch-protocol-"));
    executable = join(directory, "protocol");
    const main = join(directory, "main.swift");
    writeFileSync(
      main,
      readFileSync(join(root, "tests/watch-protocol-harness.swift")),
    );
    const source = readFileSync(
      join(root, "modules/watch-bridge/ios/WatchBridgeModule.swift"),
      "utf8",
    );
    const begin = source.indexOf("  func sendCommand(");
    let finish = source.indexOf("{", begin),
      depth = 1;
    while (depth && ++finish < source.length) {
      if (source[finish] === "{") depth++;
      if (source[finish] === "}") depth--;
    }
    if (begin < 0 || depth)
      throw new Error("Missing native scoped command method");
    writeFileSync(
      main,
      readFileSync(main, "utf8").replace(
        "  // PHONE_COMMAND_METHOD",
        source.slice(begin, finish + 1),
      ),
    );
    execFileSync(
      "xcrun",
      [
        "swiftc",
        join(root, "modules/watch-bridge/ios/WatchRecordingJournal.swift"),
        main,
        "-o",
        executable,
      ],
      { timeout: 30_000 },
    );
  }, 35_000);
  afterAll(() => rmSync(directory, { recursive: true, force: true }));
  function run(scenario) {
    return JSON.parse(
      execFileSync(executable, [scenario], {
        encoding: "utf8",
        timeout: 5_000,
      }),
    );
  }
  it("revokes an unadmitted Start after launch timeout so tomorrow cannot start it", () => {
    expect(run("timeout-before-admission")).toMatchObject({
      released: true,
      offeredTomorrow: false,
    });
  });
  it("keeps admitted ownership through a launch timeout, restart and an idle status reply", () => {
    expect(run("timeout-after-admission")).toMatchObject({
      released: false,
      wireIdRetained: true,
      mappedStatus: "recoveryFailed",
    });
  });
  it("replays original completion time before admitting the next day's workout", () => {
    expect(run("next-day")).toMatchObject({
      startIsB: true,
      closeIsA: true,
      endedAt: 2000,
      closureSurvivedRestart: true,
    });
  });
  it("never reopens a closed attempt, and retries with a separate recording identity", () => {
    expect(run("retry")).toMatchObject({
      newIdentity: true,
      sameHealthIdentity: true,
      oldResultApp: "A",
    });
  });
  it("routes Retry to the recording attempt and refuses another account's coincident app id", () => {
    expect(run("scoped-retry")).toEqual({
      correctAttempt: true,
      wakesRecovery: true,
      otherAccountCommands: 0,
    });
  });
  it("coalesces duplicate starts before any recording acknowledgement", () => {
    expect(run("duplicate-start")).toEqual({ sameAttempt: true, pending: 1 });
  });
  it("does not rewrite the durable journal for live metrics or repeated state", () => {
    expect(run("metrics-read-only")).toEqual({ journalUntouched: true });
  });
  it("never grants admission if the durable journal cannot commit, and rolls back the in-memory grant", () => {
    expect(run("storage-failure")).toEqual({
      granted: false,
      threw: true,
      remainedUnadmitted: true,
    });
  });
  it("fails closed on a damaged journal without replacing it", () => {
    expect(run("corrupt-storage")).toEqual({
      offered: false,
      granted: false,
      untouched: true,
    });
  });
  it("cannot discard another account's recording even when restored app ids coincide", () => {
    expect(run("cross-account-identity")).toEqual({
      commands: 0,
      owner: "alice",
      stillPending: true,
    });
  });
  it("keeps a guest recording alive when its workout transfers to the signed-in account", () => {
    expect(run("guest-adoption")).toEqual({
      owner: "account:alice",
      appId: "A",
      pendingClosures: 0,
    });
  });
  it("does not let a delayed old rejection release a newer admitted attempt", () => {
    expect(run("old-rejection-after-retry")).toEqual({
      status: "starting",
      pending: 1,
    });
  });
  it("fences a Finish that beats slow authorization without queueing a non-existent Watch recording", () => {
    expect(run("finish-before-offer")).toEqual({
      queuedCommands: 0,
      offeredAfterFinish: false,
    });
  });
  it("preserves a genuinely running Watch workout when its initial acknowledgement was lost", () => {
    expect(run("expired-active-recovery")).toEqual({
      closures: 0,
      released: false,
      pending: 1,
    });
  });
  it("cancels an expired unknown attempt only after Watch recovery proves it inactive", () => {
    expect(run("expired-no-active-recovery")).toEqual({
      closuresBeforeRecovery: 0,
      closuresAfterRecovery: 1,
      statusAfterCancellation: "idle",
    });
  });
  it("retires expired invitations across restart without releasing admitted recordings", () => {
    expect(run("expiry")).toMatchObject({
      expiredApps: ["A"],
      admittedStillPending: true,
      oldOfferAbsent: true,
    });
  });
  it("blocks previous-account admission while preserving its scoped closure", () => {
    expect(run("account-switch")).toMatchObject({
      offered: false,
      closeIsA: true,
      endedAt: 3000,
    });
  });
  it("treats explicit unsaved rejection as retryable idle but retains saved evidence", () => {
    expect(run("rejected")).toEqual({
      rejectionStatus: "idle",
      savedType: "ended",
      savedApp: "B",
      healthUuid: "health-b",
    });
  });
});
