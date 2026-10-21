import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseNoteEditor } from "./exercise-note-editor";

vi.mock("react-native", () => ({ Text: "Text", View: "View" }));
vi.mock("@/components/ui", () => ({ Field: "Field" }));
vi.mock("@/theme", () => ({ colors: {} }));

let renderer: ReactTestRenderer | undefined;
const save = vi.fn<(note: string) => Promise<void>>();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  save.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
});
async function render(initial = "") {
  await act(async () => {
    renderer = create(<ExerciseNoteEditor initial={initial} onSave={save} />);
  });
}
function field() {
  return renderer!.root.find((node) => String(node.type) === "Field");
}
function hints() {
  return renderer!.root.findAll((node) => String(node.type) === "Text");
}

describe("exercise note editing", () => {
  it("saves a long note without showing a limit until the note is near it", async () => {
    await render();
    const note = "x".repeat(8_999);
    await act(async () => {
      field().props.onChangeText(note);
    });
    expect(hints()).toHaveLength(0);
    await act(async () => {
      field().props.onBlur();
    });
    expect(save).toHaveBeenCalledWith(note);
    expect(field().props.value).toBe(note);
    await act(async () => {
      field().props.onChangeText("x".repeat(9_000));
    });
    expect(hints()[0].children.join("")).toContain("9,000 / 10,000");
  });
  it("keeps all pasted overflow text and resumes saving after it is shortened", async () => {
    await render();
    const oversized = "x".repeat(10_001);
    await act(async () => {
      field().props.onChangeText(oversized);
    });
    await act(async () => {
      field().props.onBlur();
    });
    expect(save).not.toHaveBeenCalled();
    expect(field().props.value).toBe(oversized);
    expect(hints()[0].children.join("")).toContain(
      "your text has not been cut",
    );
    const valid = oversized.slice(0, 10_000);
    await act(async () => {
      field().props.onChangeText(valid);
    });
    await act(async () => {
      field().props.onBlur();
    });
    expect(save).toHaveBeenCalledWith(valid);
  });
  it("retains a draft after a save failure", async () => {
    await render("old cue");
    save.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => {
      field().props.onChangeText("new cue");
    });
    await act(async () => {
      field().props.onBlur();
    });
    expect(field().props.value).toBe("new cue");
    expect(hints()[0].children.join("")).toContain("disk full");
  });
  it("refreshes saved text without overwriting an unsaved draft", async () => {
    await render("old cue");
    await act(async () => {
      renderer!.update(
        <ExerciseNoteEditor initial="loaded cue" onSave={save} />,
      );
    });
    expect(field().props.value).toBe("loaded cue");
    await act(async () => {
      field().props.onChangeText("offline draft");
    });
    await act(async () => {
      renderer!.update(
        <ExerciseNoteEditor initial="cloud cue" onSave={save} />,
      );
    });
    expect(field().props.value).toBe("offline draft");
  });

  it("adopts a newer cloud correction when the saved note's intermediate read was skipped", async () => {
    await render("original cue");
    await act(async () => field().props.onChangeText("saved correction"));
    await act(async () => field().props.onBlur());
    expect(save).toHaveBeenCalledWith("saved correction");
    await act(async () =>
      renderer!.update(
        <ExerciseNoteEditor initial="newer cloud cue" onSave={save} />,
      ),
    );
    expect(field().props.value).toBe("newer cloud cue");
    await act(async () => field().props.onBlur());
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("persists a revert before the previous successful save is reflected in props", async () => {
    await render("original cue");
    await act(async () => field().props.onChangeText("saved correction"));
    await act(async () => field().props.onBlur());
    await act(async () => field().props.onChangeText("original cue"));
    await act(async () => field().props.onBlur());
    expect(save.mock.calls.map(([note]) => note)).toEqual([
      "saved correction",
      "original cue",
    ]);
  });

  it("queues a revert while a save is pending, keeps unsaved text, and recovers from failure", async () => {
    await render("original cue");
    let finishFirst!: () => void;
    save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    save.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => field().props.onChangeText("saved correction"));
    await act(async () => field().props.onBlur());
    await act(async () => field().props.onChangeText("original cue"));
    await act(async () => field().props.onBlur());
    await act(async () => finishFirst());
    expect(save.mock.calls.map(([note]) => note)).toEqual([
      "saved correction",
      "original cue",
    ]);
    expect(field().props.value).toBe("original cue");
    expect(hints()[0].children.join("")).toContain("disk full");
    await act(async () => field().props.onBlur());
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("wraps as a growing multiline field so Return inserts a newline", async () => {
    await render("long cue that used to clip");
    expect(field().props.multiline).toBe(true);
    expect(field().props.autoGrow).toBe(true);
  });
});
