import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncWorker, type SyncPassResult } from "./sync-worker";

function deferred() {
  let resolve!: (result: SyncPassResult) => void;
  const promise = new Promise<SyncPassResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("durable sync scheduling", () => {
  it("coalesces cloud/local wakeups without overlapping uploads or acknowledgments", async () => {
    const first = deferred();
    const drain = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue("idle");
    const worker = new SyncWorker(drain, vi.fn());
    worker.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 100; i++) worker.wake();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(drain).toHaveBeenCalledTimes(1);
    first.resolve("idle");
    await vi.runAllTimersAsync();
    expect(drain).toHaveBeenCalledTimes(2);
    worker.setEnabled(false);
  });

  it("retries failed uploads without needing another edit; wakeups cannot bypass backoff", async () => {
    const drain = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("ack failed"))
      .mockResolvedValue("idle");
    const worker = new SyncWorker(drain, vi.fn());
    worker.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 100; i++) worker.wake();
    await vi.advanceTimersByTimeAsync(1999);
    expect(drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(drain).toHaveBeenCalledTimes(2);
    worker.wake();
    await vi.advanceTimersByTimeAsync(3999);
    expect(drain).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(drain).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(drain).toHaveBeenCalledTimes(3);
    worker.setEnabled(false);
  });

  it("continues after a bounded batch until the queue is empty", async () => {
    const drain = vi
      .fn()
      .mockResolvedValueOnce("more")
      .mockResolvedValueOnce("more")
      .mockResolvedValue("idle");
    const worker = new SyncWorker(drain, vi.fn());
    worker.setEnabled(true);
    await vi.runAllTimersAsync();
    expect(drain).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    worker.setEnabled(false);
  });

  it("pauses retries in the background and resumes without overlapping the previous pass", async () => {
    const first = deferred();
    let canContinue!: () => boolean;
    const drain = vi
      .fn()
      .mockImplementationOnce((can: () => boolean) => {
        canContinue = can;
        return first.promise;
      })
      .mockResolvedValue("idle");
    const worker = new SyncWorker(drain, vi.fn());
    worker.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    worker.setEnabled(false);
    expect(canContinue()).toBe(false);
    worker.setEnabled(true);
    expect(canContinue()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(drain).toHaveBeenCalledTimes(1);
    first.resolve("idle");
    await vi.runAllTimersAsync();
    expect(drain).toHaveBeenCalledTimes(2);
    worker.setEnabled(false);
  });

  it("retains the cooldown across a foreground/reconnect cycle", async () => {
    const drain = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue("idle");
    const worker = new SyncWorker(drain, vi.fn());
    worker.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    worker.setEnabled(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(drain).toHaveBeenCalledTimes(1);
    worker.setEnabled(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(drain).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(drain).toHaveBeenCalledTimes(2);
    worker.setEnabled(false);
  });
});
