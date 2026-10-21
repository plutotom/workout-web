import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WatchEvent } from "./watch-session";

const mocks = vi.hoisted(() => ({
  native: null as Record<string, unknown> | null,
  listener: undefined as ((event: WatchEvent) => void) | undefined,
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => mocks.native,
}));
beforeEach(() => {
  vi.resetModules();
  mocks.listener = undefined;
  mocks.native = {
    getStatus: () => ({
      supported: true,
      paired: true,
      installed: true,
      reachable: true,
    }),
    startWatchWorkout: vi.fn().mockResolvedValue(undefined),
    endWatchWorkout: vi.fn().mockResolvedValue(undefined),
    discardWatchWorkout: vi.fn().mockResolvedValue(undefined),
    addListener: (_name: string, listener: (event: WatchEvent) => void) => {
      mocks.listener = listener;
      return { remove: vi.fn() };
    },
  };
});
const state = (sessionId: string, status: "starting" | "recording" | "idle") =>
  ({ type: "state", sessionId, status, reachable: true }) as const;

describe("Watch bridge compatibility and recovery", () => {
  it("supports legacy binaries and binds legacy metrics to the active workout", async () => {
    const bridge = await import("./watch-bridge");
    bridge.subscribeWatchEvents(() => {});
    await bridge.startWatchWorkout({ sessionId: "a", startedAt: 100 });
    mocks.listener!(state("a", "recording"));
    mocks.listener!({
      type: "metrics",
      heartRate: 100,
      activeEnergyKcal: 10,
      durationSeconds: 60,
    });
    expect(bridge.getWatchSessionSnapshot("a")).toMatchObject({
      status: "recording",
      heartRate: 100,
    });
    await bridge.endWatchWorkout("a");
    await bridge.discardWatchWorkout("a");
    expect(mocks.native!.endWatchWorkout).toHaveBeenCalledTimes(1);
    expect(mocks.native!.discardWatchWorkout).toHaveBeenCalledTimes(1);
  });
  it("replays durable terminal state after JS restart without starting again", async () => {
    mocks.native!.getSessionEvents = () => [
      state("a", "recording"),
      { type: "ended", sessionId: "a", healthUuid: "health-a" },
    ];
    const bridge = await import("./watch-bridge");
    const receive = vi.fn();
    bridge.subscribeWatchEvents(receive);
    expect(bridge.getWatchSessionSnapshot("a")).toMatchObject({
      status: "ended",
      healthUuid: "health-a",
    });
    await bridge.startWatchWorkout({ sessionId: "a", startedAt: 100 });
    expect(mocks.native!.startWatchWorkout).not.toHaveBeenCalled();
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ended", healthUuid: "health-a" }),
    );
  });
  it("uses scoped commands when supported", async () => {
    mocks.native!.endWatchSession = vi.fn();
    mocks.native!.discardWatchSession = vi.fn();
    const bridge = await import("./watch-bridge");
    await bridge.endWatchWorkout("a");
    await bridge.discardWatchWorkout("a");
    expect(mocks.native!.endWatchSession).toHaveBeenCalledWith("a");
    expect(mocks.native!.discardWatchSession).toHaveBeenCalledWith("a");
    expect(mocks.native!.endWatchWorkout).not.toHaveBeenCalled();
  });
  it("ignores stale starts, reconnects, and empty acknowledgements after a saved ending", async () => {
    const bridge = await import("./watch-bridge");
    bridge.subscribeWatchEvents(() => {});
    mocks.listener!(state("a", "recording"));
    mocks.listener!(state("a", "starting"));
    expect(bridge.getWatchSessionSnapshot("a").status).toBe("recording");
    mocks.listener!({ type: "ended", sessionId: "a", healthUuid: "health-a" });
    mocks.listener!(state("a", "recording"));
    mocks.listener!({ type: "ended", sessionId: "a", healthUuid: null });
    mocks.listener!({
      type: "state",
      sessionId: "",
      status: "reachable",
      reachable: true,
    });
    expect(bridge.getWatchSessionSnapshot("a")).toMatchObject({
      status: "ended",
      healthUuid: "health-a",
    });
  });
  it("keeps a confirmed recording if launch reports a late timeout", async () => {
    mocks.native!.startWatchWorkout = vi.fn(async () => {
      mocks.listener!(state("a", "recording"));
      throw new Error("No response");
    });
    const bridge = await import("./watch-bridge");
    await expect(
      bridge.startWatchWorkout({ sessionId: "a", startedAt: 100 }),
    ).resolves.toBeUndefined();
    expect(bridge.getWatchSessionSnapshot("a").status).toBe("recording");
  });
  it("releases a failed start for explicit retry and deduplicates concurrent attempts", async () => {
    const start = vi
      .fn()
      .mockRejectedValueOnce(new Error("Denied"))
      .mockResolvedValue(undefined);
    mocks.native!.startWatchWorkout = start;
    const bridge = await import("./watch-bridge");
    await expect(
      bridge.startWatchWorkout({ sessionId: "a", startedAt: 100 }),
    ).rejects.toThrow();
    expect(bridge.getWatchSessionSnapshot("a").status).toBe("idle");
    await Promise.all([
      bridge.startWatchWorkout({ sessionId: "a", startedAt: 100 }),
      bridge.startWatchWorkout({ sessionId: "a", startedAt: 100 }),
    ]);
    expect(start).toHaveBeenCalledTimes(2);
  });
});
