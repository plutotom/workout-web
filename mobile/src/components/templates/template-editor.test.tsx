import { Profiler } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemplateEditor } from "./template-editor";
import { ExerciseNoteEditor } from "../exercise-note-editor";
import { EXERCISE_NOTE_INPUT_MAX_HEIGHT } from "@shared/exercise-notes";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  notes: { squat: "Original cue" },
  saveRemote: vi.fn(),
  saveLocal: vi.fn(),
}));

vi.mock(
  "@backend/api",
  async () => import("../../../../backend/_generated/api"),
);
vi.mock("convex/react", () => ({
  useQuery: () => mocks.notes,
  useMutation: () => mocks.saveRemote,
}));
vi.mock("@/auth/auth-provider", () => ({
  useMobileAuth: () => ({ isAuthenticated: mocks.authenticated }),
}));
vi.mock("@/data/local/provider", () => ({
  useLocalData: () => ({ saveNote: mocks.saveLocal }),
  useLocalExerciseNotes: () => mocks.notes,
}));
vi.mock("@/providers/catalog-provider", () => ({
  useCatalog: () => ({ name: (slug: string) => slug }),
}));
vi.mock("@/lib/ai", () => ({ useAiGeneration: () => ({ available: false }) }));
vi.mock("@/components/ai-prompt-modal", () => ({
  AiPromptModal: "AiPromptModal",
}));
vi.mock("@/components/charts", () => ({
  buildMuscleSegments: () => [],
  MuscleBand: "MuscleBand",
}));
vi.mock("@/components/exercise-picker", () => ({
  ExercisePicker: "ExercisePicker",
}));
vi.mock("@/components/workout/exercise-options", () => ({
  ExerciseOptionsButton: "ExerciseOptionsButton",
}));
// Keep the real Field so layout events and draft updates exercise production UI.
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: vi.fn() },
  Pressable: "Pressable",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("react-native-keyboard-controller", () => ({
  KeyboardAvoidingView: "KeyboardAvoidingView",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
vi.mock("@/components/keyboard-aware-scroll", () => ({
  KeyboardAwareFooterLayout: "KeyboardAwareFooterLayout",
  KeyboardAwareScroll: "KeyboardAwareScroll",
}));
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("expo-haptics", () => ({}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "ChevronLeft",
      "ChevronDown",
      "ChevronUp",
      "Plus",
      "Sparkles",
      "Trash2",
      "X",
    ].map((name) => [name, name]),
  ),
);

let renderer: ReactTestRenderer | undefined;
const commits = vi.fn();
const initial = {
  name: "Leg day",
  exercises: [{ slug: "squat", sets: [{ weight: 100, reps: 5 }] }],
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.authenticated = true;
  mocks.notes = { squat: "Original cue" };
  mocks.saveRemote.mockReset().mockResolvedValue(undefined);
  mocks.saveLocal.mockReset().mockResolvedValue(undefined);
  commits.mockClear();
});

describe("growing exercise notes in a workout", () => {
  it("keeps insertion, deletion, newlines, and long pasted text stable while resizing", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      renderer = create(
        <ExerciseNoteEditor initial="Keep knees out" onSave={save} />,
      );
    });
    await act(async () => note().props.onFocus({}));
    const input = note();
    const longNote = "Setup cue\n".repeat(100);
    for (const text of [
      "Keep both knees out",
      "Keep knees out",
      "Keep knees out\nBrace",
      longNote,
      "",
      "Final cue ",
    ]) {
      // Exercise both event orders; native layout and text updates are separate.
      await size(500);
      await act(async () => note().props.onChangeText(text));
      await size(48);
      expect(note().props.value).toBe(text);
      expect(note()).toBe(input);
      expect(note().props.selection).toBeUndefined();
    }
    expect(save).not.toHaveBeenCalled();
    await act(async () => note().props.onBlur({}));
    expect(save).toHaveBeenCalledWith("Final cue");
  });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});
async function render() {
  await act(async () => {
    const tree = (
      <Profiler id="template" onRender={commits}>
        <TemplateEditor initial={initial} />
      </Profiler>
    );
    if (renderer) renderer.update(tree);
    else renderer = create(tree);
  });
}
function note() {
  return renderer!.root
    .findAllByType("TextInput" as never)
    .find((node) => node.props.multiline)!;
}
async function size(height: number) {
  await act(async () =>
    note().props.onContentSizeChange?.({
      nativeEvent: { contentSize: { width: 300, height } },
    }),
  );
}

describe("growing exercise notes in the template editor", () => {
  it.each([true, false])(
    "keeps typing local across size events and stale reads (signed in: %s)",
    async (authenticated) => {
      mocks.authenticated = authenticated;
      await render();
      await act(async () => note().props.onFocus({}));
      const input = note();
      const text = "Original cue\nKeep knees out ";
      for (let length = 1; length <= text.length; length++) {
        const next = text.slice(0, length);
        await act(async () => note().props.onChangeText(next));
        await size(length % 2 ? 48 : 70);
        expect(note().props.value).toBe(next);
        expect(note()).toBe(input);
      }
      mocks.notes = { squat: "Stale server cue" };
      await render();
      expect(note().props.value).toBe(text);
      await act(async () => note().props.onBlur({}));
      if (authenticated) {
        expect(mocks.saveRemote).toHaveBeenCalledWith({
          exerciseSlug: "squat",
          notes: text,
        });
        expect(mocks.saveLocal).not.toHaveBeenCalled();
      } else {
        expect(mocks.saveLocal).toHaveBeenCalledWith("squat", text);
        expect(mocks.saveRemote).not.toHaveBeenCalled();
      }
      expect(note().props.value).toBe(text);
    },
  );

  it("lets native layout grow and shrink without a React update per size event", async () => {
    await render();
    await act(async () => note().props.onFocus({}));
    const input = note();
    const renderCount = commits.mock.calls.length;
    for (const height of [48, 70, 180, 220, 500, 202, 180, 48]) {
      await size(height);
      expect(note().props.scrollEnabled).toBe(true);
      expect(note()).toBe(input);
    }
    expect(commits).toHaveBeenCalledTimes(renderCount);
    expect(note().props.style).toContainEqual(
      expect.objectContaining({ maxHeight: EXERCISE_NOTE_INPUT_MAX_HEIGHT }),
    );
    expect(note().props.multiline).toBe(true);
    expect(note().props.blurOnSubmit).toBe(false);
    await act(async () => note().props.onBlur({}));
    expect(note().props.scrollEnabled).toBe(false);
    expect(note().props.style).toContainEqual(
      expect.objectContaining({ maxHeight: undefined }),
    );
  });

  it("keeps later edits across a pending save, collapse, and reopen", async () => {
    await render();
    let finish!: () => void;
    mocks.saveRemote.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => note().props.onChangeText("First correction"));
    await act(async () => note().props.onBlur({}));
    await act(async () => note().props.onFocus({}));
    await act(async () => note().props.onChangeText("Second correction"));
    mocks.notes = { squat: "First correction" };
    await render();
    await act(async () => finish());
    await size(90);
    expect(note().props.value).toBe("Second correction");
    const toggle = renderer!.root
      .findAllByType("Pressable" as never)
      .find((node) => node.props.style?.minHeight === 62)!;
    await act(async () => toggle.props.onPress());
    expect(note()).toBeUndefined();
    await act(async () => toggle.props.onPress());
    expect(note().props.value).toBe("Second correction");
    expect(mocks.saveRemote).toHaveBeenLastCalledWith({
      exerciseSlug: "squat",
      notes: "Second correction",
    });
  });
});
