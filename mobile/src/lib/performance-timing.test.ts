import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { measureMobileAsync, startMobileTiming } from "./performance-timing";

let clock = 0;
beforeEach(() => {
  clock = 0;
  vi.stubGlobal("__DEV__", true);
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(console, "debug").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mobile performance diagnostics", () => {
  it("records pending work and confirmation without waiting to start the operation", async () => {
    let resolve!: (value: string) => void;
    const operation = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const task = measureMobileAsync("social.like.confirmation", operation);
    expect(operation).toHaveBeenCalledOnce();
    expect(console.debug).toHaveBeenCalledExactlyOnceWith(
      "[mobile-timing]",
      expect.objectContaining({
        event: "start",
        name: "social.like.confirmation",
      }),
    );
    clock = 15_000;
    resolve("confirmed");
    await expect(task).resolves.toBe("confirmed");
    expect(console.debug).toHaveBeenLastCalledWith(
      "[mobile-timing]",
      expect.objectContaining({
        event: "finish",
        outcome: "success",
        durationMs: 15_000,
      }),
    );
  });

  it("rethrows the original failure and logs only timing metadata", async () => {
    const error = new Error("private request content");
    await expect(
      measureMobileAsync("auth.token", async () => {
        clock = 800;
        throw error;
      }),
    ).rejects.toBe(error);
    expect(console.debug).toHaveBeenLastCalledWith(
      "[mobile-timing]",
      expect.objectContaining({
        event: "finish",
        outcome: "failure",
        durationMs: 800,
      }),
    );
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain(
      error.message,
    );
  });

  it("finishes a cancelled measurement only once", () => {
    const finish = startMobileTiming("social.comments");
    clock = 100;
    finish("cancelled");
    clock = 400;
    finish();
    expect(console.debug).toHaveBeenCalledTimes(2);
    expect(console.debug).toHaveBeenLastCalledWith(
      "[mobile-timing]",
      expect.objectContaining({ outcome: "cancelled", durationMs: 100 }),
    );
  });

  it("does not log or change operation results in release builds", async () => {
    vi.stubGlobal("__DEV__", false);
    startMobileTiming("social.feed")();
    await expect(
      measureMobileAsync("social.like.confirmation", async () => true),
    ).resolves.toBe(true);
    const error = new Error("failed");
    await expect(
      measureMobileAsync("auth.token", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(console.debug).not.toHaveBeenCalled();
  });
});
