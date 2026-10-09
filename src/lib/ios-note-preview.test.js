// Exercise the real mobile components with native rendering and app services stubbed.
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { buildCatalog } from "./exercises";

const mobileRoot = resolve(import.meta.dirname, "../../mobile");
const requireMobile = createRequire(join(mobileRoot, "package.json"));
const React = requireMobile("react");
const { create, act } = requireMobile("react-test-renderer");
let components;
let directory;
let renderer;
let harness;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "workout-note-preview-"));
  const mocks = {
    "react-native": `export const Alert = {alert: (...args) => globalThis.__notePreviewHarness.alerts.push(args)};
      export const Keyboard = {dismiss() {}};
      export const StyleSheet = {create: s => s, hairlineWidth: 1};
      export const Modal = 'Modal', Pressable = 'Pressable', ScrollView = 'ScrollView', Text = 'Text', View = 'View';
      export function FlatList(props) { return React.createElement('FlatList', props, props.data.map(item => React.createElement(React.Fragment, {key: props.keyExtractor(item)}, props.renderItem({item})))); }`,
    "react-native-safe-area-context": `export const SafeAreaView = 'SafeAreaView';`,
    "lucide-react-native": `export const Check = 'Check', ChevronDown = 'ChevronDown', ChevronRight = 'ChevronRight', Trash2 = 'Trash2', X = 'X', ListChecks = 'ListChecks', Pencil = 'Pencil';`,
    "expo-sqlite": `export const useSQLiteContext = () => ({});`,
    "expo-router": `export const router = {push: path => globalThis.__notePreviewHarness.routes.push(path)};`,
    "convex/react": `export const useQuery = () => globalThis.__notePreviewHarness.entitlement;`,
    "@backend/api": `export const api = {routes: {auth: {users: {entitlement: {}}}}};`,
    "auth/auth-provider": `export const useMobileAuth = () => ({isAuthenticated: globalThis.__notePreviewHarness.authenticated});`,
    "components/keyboard-sticky-footer": `export const KeyboardStickyFooter = 'KeyboardStickyFooter';`,
    "components/ui": `export const Button = 'Button', Card = 'Card', Field = 'Field';`,
    "components/workout/note-workout-editor": `export const WorkoutNoteField = 'WorkoutNoteField';`,
    "data/local/provider": `export const useLocalData = () => ({saveWorkoutNote: globalThis.__notePreviewHarness.save, convertWorkoutNote: globalThis.__notePreviewHarness.convert}); export const useLocalPreferences = () => ({unit: globalThis.__notePreviewHarness.unit});`,
    "data/local/repository": `export async function getLocalWorkout(db, id) { globalThis.__notePreviewHarness.reads.push(id); return globalThis.__notePreviewHarness.local; }`,
    "providers/catalog-provider": `export const useCatalog = () => globalThis.__notePreviewHarness.catalog;`,
  };
  const outfile = join(directory, "components.cjs");
  await build({
    stdin: {
      contents:
        'export { NoteWorkoutBody } from "./note-workout-body"; export { NoteConversionPreviewSheet } from "./note-conversion-preview"; export { writeDevProOverride } from "@shared/dev-pro-override";',
      resolveDir: join(mobileRoot, "src/components/workout"),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile,
    jsx: "automatic",
    alias: { "@": join(mobileRoot, "src"), "@shared": import.meta.dirname },
    plugins: [
      {
        name: "native-and-services",
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (/^react(?:\/jsx-runtime)?$/.test(args.path))
              return { path: requireMobile.resolve(args.path), external: true };
            const key = args.path.startsWith("@/")
              ? args.path.slice(2)
              : args.path.startsWith(join(mobileRoot, "src") + "/")
                ? args.path.slice((join(mobileRoot, "src") + "/").length)
                : args.path;
            if (mocks[key]) return { path: key, namespace: "preview-test" };
          });
          builder.onLoad(
            { filter: /.*/, namespace: "preview-test" },
            (args) => ({
              contents: `import * as React from ${JSON.stringify(requireMobile.resolve("react"))};\n${mocks[args.path]}`,
              resolveDir: mobileRoot,
            }),
          );
        },
      },
    ],
  });
  components = requireMobile(outfile);
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  components.writeDevProOverride("server");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  harness = globalThis.__notePreviewHarness = {
    authenticated: true,
    entitlement: { isPro: true },
    local: null,
    catalog: buildCatalog(),
    alerts: [],
    routes: [],
    reads: [],
    save: vi.fn(),
    convert: vi.fn().mockResolvedValue(undefined),
    unit: "lb",
  };
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  renderer = undefined;
  delete globalThis.__notePreviewHarness;
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  vi.unstubAllEnvs();
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function mount(Component, props) {
  await act(async () => {
    renderer = create(React.createElement(Component, props));
  });
}
const button = (label) =>
  renderer.root
    .findAllByType("Button")
    .find((node) => node.props.label === label);
const field = (label) =>
  renderer.root
    .findAllByType("Field")
    .find((node) => node.props.accessibilityLabel?.startsWith(label));
const pressable = (label) =>
  renderer.root
    .findAllByType("Pressable")
    .find((node) => node.props.accessibilityLabel === label);
const text = () => JSON.stringify(renderer.toJSON());
async function press(node) {
  expect(node).toBeDefined();
  await act(async () => node.props.onPress());
}

describe("iOS note conversion preview", () => {
  it("loads the latest local note without adopting or saving it", async () => {
    const prepareEdit = vi.fn();
    harness.local = {
      _id: "note",
      inputMode: "note",
      status: "completed",
      noteBody: "Deadlift: 6@235",
      noteUnit: "kg",
    };
    await mount(components.NoteWorkoutBody, {
      sessionId: "note",
      noteBody: "Deadlift: 5@180",
      noteUnit: "lb",
      prepareEdit,
    });
    await press(button("Convert note · Pro"));
    expect(field("Completed reps").props.value).toBe("6");
    expect(field("Weight in kg").props.value).toBe("235");
    expect(harness.reads).toEqual(["note"]);
    expect(prepareEdit).not.toHaveBeenCalled();
    expect(harness.save).not.toHaveBeenCalled();
    await press(button("Cancel"));
    expect(renderer.root.findAllByType("Modal")).toHaveLength(0);
    expect(harness.local.noteBody).toBe("Deadlift: 6@235");
  });

  it("requires Pro and does not read workout data for an upgrade prompt", async () => {
    harness.entitlement = { isPro: false };
    await mount(components.NoteWorkoutBody, {
      sessionId: "remote",
      noteBody: "Deadlift: 6@180",
      noteUnit: "lb",
    });
    await press(button("Convert note · Pro"));
    expect(renderer.root.findAllByType("Modal")).toHaveLength(0);
    expect(harness.reads).toEqual([]);
    expect(harness.alerts[0][0]).toContain("Pro");
    harness.alerts[0][2].find((option) => option.text === "View Pro").onPress();
    expect(harness.routes).toEqual(["/settings"]);
  });

  it("asks for a missing saved unit before interpreting numbers", async () => {
    await mount(components.NoteConversionPreviewSheet, {
      noteBody: "Deadlift: 6@100",
      onClose: vi.fn(),
    });
    expect(field("Weight")).toBeUndefined();
    await press(button("Kilograms (kg)"));
    expect(field("Weight in kg").props.value).toBe("100");
    expect(text()).toContain("Written in kg");
  });

  it("allows exercise matching and number/failure edits, keeps source text, and discards on close", async () => {
    const onClose = vi.fn();
    const original = "Press: 4@25F\n225 ??";
    await mount(components.NoteConversionPreviewSheet, {
      noteBody: original,
      noteUnit: "lb",
      onClose,
    });
    await press(button("Choose exercise"));
    await press(pressable("Choose Overhead Press (Dumbbell)"));
    await act(async () => field("Completed reps").props.onChangeText("5"));
    await act(async () => field("Weight in lb").props.onChangeText("30"));
    const failure = pressable("Failed attempt after completed reps");
    expect(failure.props.accessibilityState.checked).toBe(true);
    await press(failure);
    expect(
      pressable("Failed attempt after completed reps").props.accessibilityState
        .checked,
    ).toBe(false);
    await press(pressable("Keep as note only"));
    expect(text()).toContain("All items reviewed");
    await press(pressable("View original note"));
    expect(
      renderer.root
        .findAllByType("Text")
        .some((node) => node.props.children === original),
    ).toBe(true);
    await press(button("Cancel"));
    expect(onClose).not.toHaveBeenCalled();
    expect(harness.alerts[0][0]).toBe("Discard preview edits?");
    harness.alerts[0][2]
      .find((option) => option.text === "Discard edits")
      .onPress();
    expect(onClose).toHaveBeenCalledOnce();
    expect(harness.save).not.toHaveBeenCalled();
  });

  it("supports adding and removing sets without inventing completed work", async () => {
    await mount(components.NoteConversionPreviewSheet, {
      noteBody: "Deadlift: 6@180",
      noteUnit: "lb",
      onClose: vi.fn(),
    });
    await press(button("Add set"));
    expect(
      renderer.root.findAllByType("Field").map((node) => node.props.value),
    ).toEqual(["6", "180", "", ""]);
    expect(text()).toContain("Enter 1–1,000 completed reps.");
    await press(pressable("Remove set 2 for Deadlift (Barbell)"));
    expect(text()).toContain("All items reviewed");
    expect(harness.save).not.toHaveBeenCalled();
  });

  it("shows converted weights before confirming once through the local provider", async () => {
    const prepareEdit = vi.fn().mockResolvedValue("adopted-note");
    await mount(components.NoteWorkoutBody, {
      sessionId: "remote-note",
      noteBody: "Deadlift: 4@100kgF",
      noteUnit: "kg",
      prepareEdit,
    });
    await press(button("Convert note · Pro"));
    expect(text()).toContain("Saved as ");
    expect(text()).toContain("220");
    expect(button("Confirm conversion").props.disabled).toBe(false);
    await press(button("Confirm conversion"));
    expect(prepareEdit).toHaveBeenCalledOnce();
    expect(harness.convert).toHaveBeenCalledWith(
      "adopted-note",
      expect.objectContaining({
        originalText: "Deadlift: 4@100kgF",
      }),
      "lb",
    );
    expect(renderer.root.findAllByType("Modal")).toHaveLength(0);
    expect(harness.save).not.toHaveBeenCalled();
  });

  it("blocks unresolved drafts and retains edits after an apply error", async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValue(new Error("Your note changed."));
    const onClose = vi.fn();
    await mount(components.NoteConversionPreviewSheet, {
      noteBody: "Press: 4@25",
      noteUnit: "lb",
      onConfirm,
      onClose,
    });
    expect(button("Confirm conversion").props.disabled).toBe(true);
    await press(button("Choose exercise"));
    await press(pressable("Choose Overhead Press (Dumbbell)"));
    await act(async () => field("Completed reps").props.onChangeText("5"));
    await press(button("Confirm conversion"));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(text()).toContain("Your note changed.");
    expect(field("Completed reps").props.value).toBe("5");
    expect(button("Confirm conversion").props.disabled).toBe(false);
  });
  it("rechecks Pro before applying an already-open preview", async () => {
    const props = {
      sessionId: "note",
      noteBody: "Deadlift: 4@225",
      noteUnit: "lb",
    };
    await mount(components.NoteWorkoutBody, props);
    await press(button("Convert note · Pro"));
    harness.entitlement = { isPro: false };
    await act(async () =>
      renderer.update(React.createElement(components.NoteWorkoutBody, props)),
    );
    await press(button("Confirm conversion"));
    expect(harness.convert).not.toHaveBeenCalled();
    expect(text()).toContain("Note conversion requires Pro");
    expect(renderer.root.findAllByType("Modal")).toHaveLength(1);
  });
  it("allows a dev Pro preview without queueing a conversion the server will reject", async () => {
    harness.entitlement = { isPro: false };
    components.writeDevProOverride("pro");
    const prepareEdit = vi.fn();
    await mount(components.NoteWorkoutBody, {
      sessionId: "note",
      noteBody: "Deadlift: 4@225",
      noteUnit: "lb",
      prepareEdit,
    });
    await press(button("Convert note · Pro"));
    await press(button("Confirm conversion"));
    expect(prepareEdit).not.toHaveBeenCalled();
    expect(harness.convert).not.toHaveBeenCalled();
    expect(text()).toContain("Saving requires active Pro access");
    expect(renderer.root.findAllByType("Modal")).toHaveLength(1);
  });
});
