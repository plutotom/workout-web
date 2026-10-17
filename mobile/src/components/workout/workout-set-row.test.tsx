import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalWorkoutSet } from "@/data/local/types";
import { WorkoutSetRow } from "./workout-set-row";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
}));
vi.mock("lucide-react-native", () => ({
  Check: "Check",
  CircleDot: "CircleDot",
}));
vi.mock("@/components/ui", () => ({ Field: "Field" }));
vi.mock("@/components/workout/plate-modal", () => ({
  PlateModal: "PlateModal",
}));

let renderer: ReactTestRenderer | undefined;
const commit =
  vi.fn<
    (values: Partial<Pick<LocalWorkoutSet, "weight" | "reps">>) => Promise<void>
  >();
const complete = vi.fn();
const initial: LocalWorkoutSet = {
  _id: "set-1",
  sessionExerciseId: "exercise-1",
  orderIndex: 0,
  targetWeight: 135,
  targetReps: 5,
  weight: 135,
  reps: 5,
  completed: true,
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  commit.mockReset().mockResolvedValue(undefined);
  complete.mockReset();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});
async function render(set = initial) {
  const row = (
    <WorkoutSetRow
      set={set}
      index={0}
      unit="lb"
      barWeight={45}
      usesBar
      onCommit={commit}
      onComplete={complete}
      onDelete={() => {}}
      canDelete
    />
  );
  await act(async () => {
    if (renderer) renderer.update(row);
    else renderer = create(row);
  });
}
function field(name: "weight" | "reps") {
  return renderer!.root.findByProps({ accessibilityLabel: `Set 1 ${name}` });
}

describe("workout set drafts across completed-workout refresh", () => {
  it("shows adopted corrections and never saves an untouched field on blur", async () => {
    await render();
    await render({ ...initial, weight: 155, reps: 8 });
    expect(field("weight").props.value).toBe("155");
    expect(field("reps").props.value).toBe("8");
    await act(async () => {
      field("weight").props.onBlur();
      field("reps").props.onBlur();
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("preserves an unsaved field while refreshing its untouched sibling and only saves the edit", async () => {
    await render();
    await act(async () => field("weight").props.onChangeText("150"));
    await render({ ...initial, weight: 155, reps: 8 });
    expect(field("weight").props.value).toBe("150");
    expect(field("reps").props.value).toBe("8");
    await act(async () => field("weight").props.onBlur());
    expect(commit).toHaveBeenCalledWith({ weight: 150 });
    // SQLite catches up to the saved draft, then another correction arrives.
    await render({ ...initial, weight: 150, reps: 8 });
    await render({ ...initial, weight: 165, reps: 10 });
    expect(field("weight").props.value).toBe("165");
    expect(field("reps").props.value).toBe("10");
  });

  it("keeps pending text while a read catches up and does not resave acknowledged values", async () => {
    await render();
    await act(async () => field("reps").props.onChangeText("6"));
    await act(async () => field("reps").props.onBlur());
    await render({ ...initial });
    expect(field("reps").props.value).toBe("6");
    await render({ ...initial, reps: 6 });
    await act(async () => field("reps").props.onBlur());
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("adopts a newer correction even when the successful save's intermediate read was skipped", async () => {
    await render();
    await act(async () => field("weight").props.onChangeText("150"));
    await act(async () => field("weight").props.onBlur());
    expect(field("weight").props.value).toBe("150");
    await render({ ...initial, weight: 165 });
    expect(field("weight").props.value).toBe("165");
    await act(async () => field("weight").props.onBlur());
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("can revert a successful edit before SQLite's read has caught up", async () => {
    await render();
    await act(async () => field("weight").props.onChangeText("150"));
    await act(async () => field("weight").props.onBlur());
    await act(async () => field("weight").props.onChangeText("135"));
    await act(async () => field("weight").props.onBlur());
    expect(commit.mock.calls.map(([patch]) => patch)).toEqual([
      { weight: 150 },
      { weight: 135 },
    ]);
  });

  it("keeps a new edit while the prior write is pending and permits retry after a later failure", async () => {
    await render();
    let finishFirst!: () => void;
    let failSecond!: (error: Error) => void;
    commit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    commit.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failSecond = reject;
        }),
    );
    await act(async () => field("weight").props.onChangeText("150"));
    await act(async () => field("weight").props.onBlur());
    await act(async () => field("weight").props.onChangeText("135"));
    await act(async () => field("weight").props.onBlur());
    expect(commit).toHaveBeenCalledTimes(2);
    await act(async () => finishFirst());
    await act(async () => failSecond(new Error("disk full")));
    expect(field("weight").props.value).toBe("135");
    await act(async () => field("weight").props.onBlur());
    expect(commit).toHaveBeenLastCalledWith({ weight: 135 });
    expect(commit).toHaveBeenCalledTimes(3);
  });

  it("retains a failed draft and permits retry", async () => {
    await render();
    commit.mockRejectedValueOnce(new Error("disk full"));
    await act(async () => field("weight").props.onChangeText("155"));
    await act(async () => field("weight").props.onBlur());
    expect(field("weight").props.value).toBe("155");
    expect(
      renderer!.root.findByProps({ accessibilityLiveRegion: "polite" })
        .children,
    ).toEqual(["disk full"]);
    await act(async () => field("weight").props.onBlur());
    expect(commit).toHaveBeenCalledTimes(2);
    expect(
      renderer!.root.findAllByProps({ accessibilityLiveRegion: "polite" }),
    ).toHaveLength(0);
  });

  it("does not let a delayed older acknowledgement make a newer saved value dirty again", async () => {
    await render();
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    commit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    commit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSecond = resolve;
        }),
    );
    await act(async () => field("weight").props.onChangeText("150"));
    await act(async () => field("weight").props.onBlur());
    await act(async () => field("weight").props.onChangeText("160"));
    await act(async () => field("weight").props.onBlur());
    await act(async () => finishSecond());
    await act(async () => finishFirst());
    await render({ ...initial, weight: 170 });
    expect(field("weight").props.value).toBe("170");
    await act(async () => field("weight").props.onBlur());
    expect(commit).toHaveBeenCalledTimes(2);
  });

  it("acknowledges drafts saved through completion before the next read arrives", async () => {
    await render();
    complete.mockResolvedValue(undefined);
    await act(async () => field("weight").props.onChangeText("150"));
    const toggle = renderer!.root
      .findAllByType("Pressable" as never)
      .find((node) => node.props.onPress && !node.props.hitSlop)!;
    await act(async () => toggle.props.onPress());
    expect(complete).toHaveBeenCalledWith(false, { weight: 150 });
    await render({ ...initial, weight: 165, completed: false });
    expect(field("weight").props.value).toBe("165");
    await act(async () => field("weight").props.onBlur());
    expect(commit).not.toHaveBeenCalled();
  });

  it("plate changes and completion use the current draft without rewriting pristine fields", async () => {
    await render();
    await render({ ...initial, reps: 8 });
    await act(async () =>
      renderer!.root.findByType("PlateModal" as never).props.onApply(155),
    );
    expect(commit).toHaveBeenCalledWith({ weight: 155 });
    await render({ ...initial, weight: 155, reps: 8 });
    const toggle = renderer!.root
      .findAllByType("Pressable" as never)
      .find((node) => node.props.onPress && !node.props.hitSlop)!;
    await act(async () => toggle.props.onPress());
    expect(complete).toHaveBeenCalledWith(false, {});
  });
});
