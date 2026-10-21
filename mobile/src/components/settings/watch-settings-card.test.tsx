import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WatchSettingsCard } from "./watch-settings-card";
const mocks = vi.hoisted(() => ({
  preferences: { autoStartWatchWorkout: true } as
    | { autoStartWatchWorkout: boolean }
    | undefined,
  save: vi.fn<(input: { autoStartWatchWorkout: boolean }) => Promise<void>>(),
  alert: vi.fn(),
  status: { supported: true, paired: true },
}));
vi.mock("@/data/local/provider", () => ({
  useLocalData: () => ({ setWatchPreferences: mocks.save }),
  useLocalPreferences: () => mocks.preferences,
}));
vi.mock("@/health/watch-bridge", () => ({
  getWatchCompanionStatus: () => mocks.status,
}));
vi.mock("@/components/ui", () => ({
  Card: "Card",
  SectionTitle: "SectionTitle",
}));
vi.mock("lucide-react-native", () => ({ Watch: "Watch" }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Alert: { alert: mocks.alert },
  Switch: "Switch",
  Text: "Text",
  View: "View",
}));
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.preferences = { autoStartWatchWorkout: true };
  mocks.status = { supported: true, paired: true };
  mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.alert.mockClear();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});
async function mount() {
  await act(async () => {
    renderer = create(<WatchSettingsCard />);
  });
}
function toggle() {
  return renderer!.root.findByType("Switch" as never);
}

describe("iOS Watch settings", () => {
  it("defaults on, saves locally, and explains the separate Health export setting", async () => {
    await mount();
    expect(toggle().props.value).toBe(true);
    expect(toggle().props.accessibilityLabel).toBe(
      "Auto-start Apple Watch workout",
    );
    await act(async () => toggle().props.onValueChange(false));
    expect(mocks.save).toHaveBeenCalledWith({ autoStartWatchWorkout: false });
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "Health is a separate setting",
    );
  });
  it("prevents interaction until preferences load and while a save is pending", async () => {
    mocks.preferences = undefined;
    await mount();
    expect(toggle().props.disabled).toBe(true);
    mocks.preferences = { autoStartWatchWorkout: false };
    await act(async () => renderer!.update(<WatchSettingsCard />));
    let finish!: () => void;
    mocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => toggle().props.onValueChange(true));
    expect(toggle().props.disabled).toBe(true);
    await act(async () => finish());
    expect(toggle().props.disabled).toBe(false);
  });
  it("keeps the saved selection and offers a retry after a storage failure", async () => {
    await mount();
    mocks.save.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => toggle().props.onValueChange(false));
    expect(mocks.alert).toHaveBeenCalledWith(
      "Couldn’t save Watch setting",
      "Please try again.",
    );
    expect(toggle().props.value).toBe(true);
    await act(async () => toggle().props.onValueChange(false));
    expect(mocks.save).toHaveBeenCalledTimes(2);
  });
  it("leaves the preference available without a paired Watch and explains why", async () => {
    mocks.status.paired = false;
    await mount();
    expect(JSON.stringify(renderer!.toJSON())).toContain(
      "No paired Apple Watch",
    );
    expect(toggle().props.disabled).toBe(false);
  });
});
