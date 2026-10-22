import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WatchCompanionCard } from "./watch-companion-card";
import type { WatchCompanionStatus, WatchEvent } from "./watch-session";

const mocks = vi.hoisted(() => ({
  listener: undefined as ((event: Record<string, unknown>) => void) | undefined,
  foreground: undefined as ((state: string) => void) | undefined,
  persisted: [] as WatchEvent[],
  preferences: { autoStartWatchWorkout: true } as
    | { autoStartWatchWorkout?: boolean }
    | undefined,
  status: {
    supported: true,
    paired: true,
    installed: true,
    reachable: true,
  } as WatchCompanionStatus,
  start:
    vi.fn<
      (id: string, startedAt: number, syncIdentifier: string) => Promise<void>
    >(),
  end: vi.fn<(id: string) => Promise<void>>(),
  requestStatus: vi.fn(),
  requestWriteAccess: vi.fn<() => Promise<string>>(),
  isAvailable: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("@/data/local/provider", () => ({
  useLocalPreferences: () => mocks.preferences,
}));
// Only native I/O is replaced: the production bridge cache/replay remains real.
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => ({
    getStatus: () => mocks.status,
    getSessionEvents: () => mocks.persisted,
    requestWatchStatus: () => mocks.requestStatus(),
    startWatchWorkout: (...args: [string, number, string]) =>
      mocks.start(...args),
    endWatchSession: (id: string) => mocks.end(id),
    addListener: (
      _name: string,
      listener: (event: Record<string, unknown>) => void,
    ) => {
      mocks.listener = listener;
      return { remove: () => {} };
    },
  }),
}));
vi.mock("@/health", () => ({
  getHealthAdapter: () => ({
    requestWriteAccess: mocks.requestWriteAccess,
    isAvailable: mocks.isAvailable,
  }),
}));
vi.mock("@/components/ui", async () => {
  const { createElement } = await import("react");
  return {
    Card: "Card",
    Button: ({ label, ...props }: { label: string }) =>
      createElement("Button", props, label),
  };
});
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: {
    addEventListener: (_name: string, callback: (state: string) => void) => {
      mocks.foreground = callback;
      return {
        remove: () => {
          mocks.foreground = undefined;
        },
      };
    },
  },
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
vi.mock("lucide-react-native", () => ({ Watch: "Watch" }));

let renderer: ReactTestRenderer | undefined;
let sessionId = "";
let count = 0;
const startedAt = 1_700_000_000_000;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionId = `session-${++count}`;
  mocks.persisted = [];
  mocks.preferences = { autoStartWatchWorkout: true };
  mocks.status = {
    supported: true,
    paired: true,
    installed: true,
    reachable: true,
  };
  mocks.start.mockReset().mockResolvedValue(undefined);
  mocks.end.mockReset().mockResolvedValue(undefined);
  mocks.requestStatus.mockClear();
  mocks.requestWriteAccess.mockReset().mockResolvedValue("connected");
  mocks.isAvailable.mockReset().mockResolvedValue(true);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});
async function mount() {
  await act(async () => {
    renderer = create(
      <WatchCompanionCard sessionId={sessionId} startedAt={startedAt} />,
    );
  });
}
function labels() {
  return JSON.stringify(renderer!.toJSON());
}
function start() {
  return renderer!.root.find(
    (node) =>
      String(node.type) === "Pressable" &&
      node.props.accessibilityLabel === "Start on Apple Watch",
  );
}
function stop() {
  return renderer!.root.find(
    (node) =>
      String(node.type) === "Button" &&
      node.children.join("") === "End on Watch",
  );
}
async function emit(event: WatchEvent) {
  await act(async () =>
    mocks.listener!(event as unknown as Record<string, unknown>),
  );
}
async function recording() {
  await emit({
    type: "state",
    sessionId,
    status: "recording",
    reachable: true,
  });
}

describe("Watch workout controls with the production session bridge", () => {
  it("retains metrics and stop controls across disconnect/reconnect", async () => {
    mocks.preferences = { autoStartWatchWorkout: false };
    await mount();
    await act(async () => start().props.onPress());
    await recording();
    await emit({
      type: "metrics",
      sessionId,
      heartRate: 120,
      activeEnergyKcal: 20,
      durationSeconds: 300,
    });
    await emit({
      type: "state",
      sessionId: "",
      status: "disconnected",
      reachable: false,
    });
    expect(labels()).toContain("disconnected");
    expect(labels()).toContain("End on Watch");
    await emit({
      type: "state",
      sessionId: "",
      status: "reachable",
      reachable: true,
    });
    expect(labels()).toContain("End on Watch");
    expect(labels()).toContain("120 bpm");
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("shows save failure and retry controls without starting another recording", async () => {
    await mount();
    await recording();
    await emit({ type: "state", sessionId, status: "saving", reachable: true });
    expect(labels()).toContain("Saving to Apple Health");
    expect(labels()).not.toContain("End on Watch");
    await emit({
      type: "state",
      sessionId,
      status: "saveFailed",
      reachable: true,
    });
    expect(labels()).toContain("couldn’t save to Health");
    const retry = renderer!.root.find(
      (node) =>
        String(node.type) === "Button" &&
        node.children.join("") === "Retry Health save",
    );
    await act(async () => retry.props.onPress());
    expect(mocks.end).toHaveBeenLastCalledWith(sessionId);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    await emit({
      type: "ended",
      sessionId,
      healthUuid: null,
      healthSaved: true,
    });
    expect(labels()).toContain("Watch saved one Health workout");
  });
  it("offers neutral Health access help until both live metrics arrive", async () => {
    await mount();
    await recording();
    expect(labels()).toContain("If readings stay blank");
    expect(labels()).not.toContain("permission denied");
    await emit({
      type: "metrics",
      sessionId,
      heartRate: 110,
      activeEnergyKcal: null,
      durationSeconds: 30,
    });
    expect(labels()).toContain("If readings stay blank");
    await emit({
      type: "metrics",
      sessionId,
      heartRate: 110,
      activeEnergyKcal: 0,
      durationSeconds: 31,
    });
    expect(labels()).not.toContain("If readings stay blank");
    expect(labels()).toContain("0 kcal");
  });
  it("restores controls after reopening without starting the Watch again", async () => {
    mocks.preferences = { autoStartWatchWorkout: false };
    await mount();
    await act(async () => start().props.onPress());
    await recording();
    await act(async () => renderer!.unmount());
    await mount();
    expect(labels()).toContain("End on Watch");
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("auto-starts once and uses the phone workout start time", async () => {
    await mount();
    expect(mocks.start).toHaveBeenCalledWith(
      sessionId,
      startedAt,
      expect.any(String),
    );
    await act(async () => renderer!.unmount());
    await mount();
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("manual start uses tap time and ignores rapid duplicate taps", async () => {
    mocks.preferences = { autoStartWatchWorkout: false };
    await mount();
    expect(mocks.start).not.toHaveBeenCalled();
    const beforeTap = Date.now();
    const button = start();
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start.mock.calls[0][1]).toBeGreaterThanOrEqual(beforeTap);
  });
  it("restores durable native state on cold JS startup and waits for Health availability", async () => {
    mocks.persisted = [
      { type: "state", sessionId, status: "recording", reachable: true },
    ];
    await mount();
    expect(labels()).toContain("End on Watch");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.requestStatus).toHaveBeenCalled();
  });
  it("restores a Health acknowledgement received while the screen was absent", async () => {
    mocks.preferences = { autoStartWatchWorkout: false };
    await mount();
    await act(async () => start().props.onPress());
    await recording();
    await act(async () => renderer!.unmount());
    renderer = undefined;
    await emit({ type: "ended", sessionId, healthUuid: "health-1" });
    await mount();
    expect(labels()).toContain("Watch saved one Health workout");
    expect(labels()).not.toContain("End on Watch");
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("refreshes on foreground without relaunching an active session", async () => {
    await mount();
    await recording();
    await act(async () => mocks.foreground!("active"));
    expect(labels()).toContain("End on Watch");
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
  it("keeps another workout's metrics and acknowledgement out of this workout", async () => {
    await mount();
    await recording();
    await emit({
      type: "metrics",
      sessionId: "another-session",
      heartRate: 199,
      activeEnergyKcal: 999,
      durationSeconds: 300,
    });
    await emit({
      type: "ended",
      sessionId: "another-session",
      healthUuid: "other-health",
    });
    expect(labels()).not.toContain("199 bpm");
    expect(labels()).toContain("End on Watch");
  });
  it("can retry a failed stop and scopes it to this session", async () => {
    await mount();
    await recording();
    mocks.end.mockRejectedValueOnce(new Error("radio unavailable"));
    await act(async () => stop().props.onPress());
    expect(labels()).toContain("Couldn’t end Watch recording");
    await act(async () => stop().props.onPress());
    expect(mocks.end).toHaveBeenLastCalledWith(sessionId);
    expect(labels()).toContain("Ending on Watch…");
    await emit({ type: "ended", sessionId, healthUuid: null });
    expect(labels()).toContain("Watch recording ended.");
    expect(labels()).not.toContain("saved one Health workout");
  });
  it("recovers from failed launch without dropping text errors or blocking retry", async () => {
    mocks.preferences = { autoStartWatchWorkout: false };
    mocks.start.mockRejectedValueOnce(new Error("Unable to launch Watch"));
    await mount();
    await act(async () => start().props.onPress());
    expect(labels()).toContain("Couldn’t launch");
    const retry = renderer!.root.find(
      (node) =>
        String(node.type) === "Button" &&
        node.children.join("") === "Start on Apple Watch",
    );
    await act(async () => retry.props.onPress());
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(labels()).toContain("End on Watch");
  });
  it("waits for preferences before auto-starting", async () => {
    mocks.preferences = undefined;
    await mount();
    expect(mocks.start).not.toHaveBeenCalled();
    mocks.preferences = { autoStartWatchWorkout: false };
    await act(async () =>
      renderer!.update(
        <WatchCompanionCard sessionId={sessionId} startedAt={startedAt} />,
      ),
    );
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it.each(["unpaired", "unsupported", "Health unavailable"])(
    "hides controls when %s",
    async (condition) => {
      if (condition === "unpaired") mocks.status.paired = false;
      if (condition === "unsupported") mocks.status.supported = false;
      if (condition === "Health unavailable")
        mocks.isAvailable.mockResolvedValue(false);
      await mount();
      expect(mocks.start).not.toHaveBeenCalled();
      expect(renderer!.toJSON()).toBeNull();
    },
  );
});
