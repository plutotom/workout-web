import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WatchCompanionCard } from "./watch-companion-card";
import type { WatchCompanionStatus } from "./watch-session";

const mocks = vi.hoisted(() => ({
  preferences: {
    autoStartWatchWorkout: true,
  } as { autoStartWatchWorkout?: boolean } | undefined,
  status: {
    supported: true,
    paired: true,
    installed: true,
    reachable: true,
  } as WatchCompanionStatus,
  startWatchWorkout: vi.fn(async () => {}),
  endWatchWorkout: vi.fn(async () => {}),
  requestWriteAccess: vi.fn(async () => "connected" as const),
  isAvailable: vi.fn(async () => true),
}));

vi.mock("@/data/local/provider", () => ({
  useLocalPreferences: () => mocks.preferences,
}));
vi.mock("@/health/watch-bridge", () => ({
  getWatchCompanionStatus: () => mocks.status,
  startWatchWorkout: (...args: unknown[]) => mocks.startWatchWorkout(...args),
  endWatchWorkout: () => mocks.endWatchWorkout(),
  subscribeWatchEvents: () => () => {},
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
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
vi.mock("lucide-react-native", () => ({ Watch: "Watch" }));
vi.mock("@/theme", () => ({
  colors: {
    text: "#fff",
    dim: "#aaa",
    danger: "#f00",
  },
}));

let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.preferences = { autoStartWatchWorkout: true };
  mocks.status = {
    supported: true,
    paired: true,
    installed: true,
    reachable: true,
  };
  mocks.startWatchWorkout.mockClear().mockResolvedValue(undefined);
  mocks.endWatchWorkout.mockClear();
  mocks.requestWriteAccess.mockClear().mockResolvedValue("connected");
  mocks.isAvailable.mockClear().mockResolvedValue(true);
});

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

async function mount() {
  await act(async () => {
    renderer = create(
      <WatchCompanionCard sessionId="session-1" startedAt={1_700_000_000_000} />,
    );
  });
  await act(async () => {});
}

function labels() {
  return JSON.stringify(renderer!.toJSON());
}

describe("WatchCompanionCard", () => {
  it("auto-starts a paired Watch when the setting is on", async () => {
    await mount();
    expect(mocks.startWatchWorkout).toHaveBeenCalledWith({
      sessionId: "session-1",
      startedAt: 1_700_000_000_000,
    });
  });

  it("does not auto-start when the setting is off and offers Start on Apple Watch", async () => {
    mocks.preferences = { autoStartWatchWorkout: false };
    await mount();
    expect(mocks.startWatchWorkout).not.toHaveBeenCalled();
    expect(labels()).toContain("Start on Apple Watch");
    const start = renderer!.root.find(
      (node) =>
        String(node.type) === "Pressable" &&
        node.props.accessibilityLabel === "Start on Apple Watch",
    );
    await act(async () => {
      start.props.onPress();
    });
    expect(mocks.startWatchWorkout).toHaveBeenCalledTimes(1);
  });

  it("hides the control when no Watch is paired", async () => {
    mocks.preferences = { autoStartWatchWorkout: false };
    mocks.status = { ...mocks.status, paired: false };
    await mount();
    expect(mocks.startWatchWorkout).not.toHaveBeenCalled();
    expect(renderer!.toJSON()).toBeNull();
  });

  it("hides the control when HealthKit is unavailable", async () => {
    mocks.isAvailable.mockResolvedValue(false);
    await mount();
    expect(mocks.startWatchWorkout).not.toHaveBeenCalled();
    expect(renderer!.toJSON()).toBeNull();
  });
});
