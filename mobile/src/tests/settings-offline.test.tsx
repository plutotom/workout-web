import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SettingsScreen from "../../app/(tabs)/settings";
import { GeneralPreferencesCard } from "../components/settings/general-preferences-card";
import type { LocalGeneralPreferencePatch } from "../data/local/types";

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    accountStatus: "connecting",
    user: { id: "user-1", email: "user@example.com" },
    signIn: vi.fn(),
    signOut: vi.fn(),
    retryAccountConnection: vi.fn(),
  },
  preferences: {
    unit: "lb" as "lb" | "kg",
    barWeightLb: 45,
    barWeightKg: 20,
    activeWorkoutMode: "focus" as "list" | "focus",
    restTimerEnabled: true,
    restTimerNotificationsEnabled: true,
    appleHealthImportNotificationsEnabled: false,
    autoStartWatchWorkout: true,
  },
  setPreferences:
    vi.fn<(patch: LocalGeneralPreferencePatch) => Promise<void>>(),
  account: undefined as undefined | { email: string },
  recovery: undefined as
    | undefined
    | {
        legacyAvailable: boolean;
        alternatives: Array<{ slug: string; notes: string; savedAt: number }>;
      },
  restoreNoteVersion: vi.fn(async () => {}),
}));

vi.mock("@backend/api", async () => import("../../../backend/_generated/api"));
vi.mock("@/auth/auth-provider", () => ({ useMobileAuth: () => mocks.auth }));
vi.mock("@/data/local/provider", () => ({
  useLocalData: () => ({
    setGeneralPreferences: mocks.setPreferences,
    restoreNoteVersion: mocks.restoreNoteVersion,
  }),
  useLocalPreferences: () => mocks.preferences,
  useBackupStatus: () => undefined,
  useDataRecovery: () => mocks.recovery,
}));
vi.mock("@/components/ui", async () => {
  const { createElement } = await import("react");
  return {
    Screen: "Screen",
    Card: "Card",
    Field: "Field",
    Segmented: "Segmented",
    SectionTitle: ({ title }: { title: string }) =>
      createElement("Title", {}, title),
    Button: ({ label, ...props }: { label: string }) =>
      createElement("Button", props, label),
  };
});
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Modal: "Modal",
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "ChevronDown",
      "CloudCheck",
      "Copy",
      "Crown",
      "Download",
      "KeyRound",
      "LogOut",
      "Settings2",
      "Share2",
      "Shield",
      "Trash2",
    ].map((name) => [name, name]),
  ),
);
vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    const name = getFunctionName(query);
    if (name === "routes/auth/users:current") return mocks.account;
    if (name === "routes/mcp/keys:list") return [];
    return undefined;
  },
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn(), replace: vi.fn() } }));
vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn() }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn() }));
vi.mock("@/lib/workout-transfer", () => ({
  pickBackupFile: vi.fn(),
  shareBackupFile: vi.fn(),
}));
vi.mock("@/lib/config", () => ({
  requirePublicConfig: () => ({ webUrl: "https://example.com" }),
}));
vi.mock("@/lib/ai", () => ({
  useAppleAiAvailability: () => ({ available: false }),
}));
vi.mock("@/hooks/use-entitlement", () => ({ useEntitlement: () => undefined }));
vi.mock("@/components/describe-with-ai-button", () => ({
  DescribeWithAiButton: "Describe",
}));
vi.mock("@/components/settings/dev-pro-override-card", () => ({
  DevProOverrideCard: "DevPro",
}));
vi.mock("@/components/settings/dev-exercise-picker-card", () => ({
  DevExercisePickerCard: "DevPicker",
}));
vi.mock("@/components/settings/notification-settings-card", () => ({
  NotificationSettingsCard: "Notifications",
}));
vi.mock("@/components/settings/places-settings-card", () => ({
  PlacesSettingsCard: "Places",
}));
vi.mock("@/health/health-settings-card", () => ({
  HealthSettingsCard: "Health",
}));
vi.mock("@/components/settings/watch-settings-card", () => ({
  WatchSettingsCard: "Watch",
}));

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(mocks.auth, {
    isAuthenticated: false,
    accountStatus: "connecting",
  });
  Object.assign(mocks.preferences, {
    unit: "lb",
    barWeightLb: 45,
    barWeightKg: 20,
    activeWorkoutMode: "focus",
    restTimerEnabled: true,
  });
  mocks.account = undefined;
  mocks.recovery = undefined;
  mocks.restoreNoteVersion.mockClear();
  mocks.setPreferences.mockReset().mockImplementation(async (patch) => {
    Object.assign(mocks.preferences, patch);
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
});
async function mount() {
  await act(async () => {
    renderer = create(<SettingsScreen />);
  });
}
function barField() {
  return renderer!.root
    .findAll((node) => String(node.type) === "Field")
    .find((node) => String(node.props.label).startsWith("Default bar"))!;
}
async function rerender() {
  await act(async () => {
    renderer!.update(<SettingsScreen />);
  });
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("local settings while offline or reconnecting", () => {
  it("offers saved note versions offline and restores the selected alternative", async () => {
    const version = {
      slug: "bench",
      notes: "A saved cloud alternative",
      savedAt: 1,
    };
    mocks.recovery = { legacyAvailable: false, alternatives: [version] };
    await mount();
    const button = (label: string) =>
      renderer!.root
        .findAll((node) => String(node.type) === "Button")
        .find((node) => node.children.includes(label))!;
    await act(async () =>
      button("Review saved note versions (1)").props.onPress(),
    );
    expect(JSON.stringify(renderer!.toJSON())).toContain(version.notes);
    await act(async () => button("Use this version").props.onPress());
    expect(mocks.restoreNoteVersion).toHaveBeenCalledWith(version);
  });
  it("renders working General controls and all device settings during account connection", async () => {
    await mount();
    expect(renderer!.root.findByType(GeneralPreferencesCard)).toBeDefined();
    for (const type of ["Places", "Health", "Watch", "Notifications"]) {
      expect(renderer!.root.findAll((node) => node.type === type)).toHaveLength(
        1,
      );
    }
    const controls = renderer!.root.findAll(
      (node) => String(node.type) === "Segmented",
    );
    await act(async () => {
      controls[1].props.onChange("list");
      controls[2].props.onChange("off");
    });
    expect(mocks.setPreferences).toHaveBeenCalledWith({
      activeWorkoutMode: "list",
    });
    expect(mocks.setPreferences).toHaveBeenCalledWith({
      restTimerEnabled: false,
    });
  });

  it("retains a bar draft through connection, account loading, and connection loss", async () => {
    const write = deferred();
    mocks.setPreferences.mockReturnValueOnce(write.promise);
    await mount();
    const general = renderer!.root.findByType(GeneralPreferencesCard);
    await act(async () => {
      barField().props.onChangeText("35");
    });
    expect(mocks.setPreferences).toHaveBeenCalledWith({ barWeightLb: 35 });
    Object.assign(mocks.auth, {
      isAuthenticated: true,
      accountStatus: "ready",
    });
    await rerender();
    expect(barField().props.value).toBe("35");
    expect(renderer!.root.findByType(GeneralPreferencesCard)).toBe(general);
    mocks.account = { email: "user@example.com" };
    await rerender();
    expect(barField().props.value).toBe("35");
    Object.assign(mocks.auth, {
      isAuthenticated: false,
      accountStatus: "error",
    });
    await rerender();
    expect(barField().props.value).toBe("35");
    await act(async () => {
      write.resolve();
      await write.promise;
    });
  });

  it("saves bar typing immediately and an older save cannot erase newer typing", async () => {
    const first = deferred();
    const next = deferred();
    mocks.setPreferences
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(next.promise);
    await mount();
    const preset = renderer!.root
      .findAll((node) => String(node.type) === "Button")
      .find((node) => node.children.includes("35 lb"))!;
    await act(async () => {
      preset.props.onPress();
    });
    await act(async () => {
      barField().props.onChangeText("37");
    });
    expect(mocks.setPreferences).toHaveBeenNthCalledWith(1, {
      barWeightLb: 35,
    });
    expect(mocks.setPreferences).toHaveBeenNthCalledWith(2, {
      barWeightLb: 37,
    });
    await act(async () => {
      first.resolve();
      await first.promise;
    });
    expect(barField().props.value).toBe("37");
    await act(async () => {
      next.resolve();
      await next.promise;
    });
    expect(barField().props.value).toBe("37");
  });

  it("saves the bar for the old unit before switching units", async () => {
    await mount();
    await act(async () => {
      barField().props.onChangeText("33");
    });
    await act(async () => {
      renderer!.root
        .findAll((node) => String(node.type) === "Segmented")[0]
        .props.onChange("kg");
    });
    expect(mocks.setPreferences).toHaveBeenNthCalledWith(1, {
      barWeightLb: 33,
    });
    expect(mocks.setPreferences).toHaveBeenNthCalledWith(2, { unit: "kg" });
    expect(barField().props.value).toBe("20");
  });
});
