import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmDeleteExercise,
  exerciseOptionItems,
  requestExerciseReplacement,
} from "./exercise-options";

vi.mock("react-native", () => ({
  ActionSheetIOS: { showActionSheetWithOptions: vi.fn() },
  Alert: { alert: vi.fn() },
  Platform: { OS: "ios" },
  Pressable: "Pressable",
}));
vi.mock("lucide-react-native", () => ({
  MoreHorizontal: "MoreHorizontal",
}));

describe("exerciseOptionItems", () => {
  it("puts Delete last and marks it destructive", () => {
    const onReplace = vi.fn();
    const onChooseMachine = vi.fn();
    const onDelete = vi.fn();
    const actions = exerciseOptionItems({
      machineName: "Corner",
      onReplace,
      onChooseMachine,
      onDelete,
    });
    expect(actions.map((action) => action.label)).toEqual([
      "Replace",
      "Machine · Corner",
      "Delete exercise",
    ]);
    expect(actions.at(-1)).toMatchObject({
      label: "Delete exercise",
      destructive: true,
    });
  });

  it("omits machine when the editor has no gym picker", () => {
    const actions = exerciseOptionItems({
      onReplace: vi.fn(),
      onDelete: vi.fn(),
    });
    expect(actions.map((action) => action.label)).toEqual([
      "Replace",
      "Delete exercise",
    ]);
  });
});

describe("confirmDeleteExercise", () => {
  beforeEach(() => {
    vi.mocked(Alert.alert).mockClear();
  });

  it("deletes immediately when no sets are logged", () => {
    const onConfirm = vi.fn();
    confirmDeleteExercise("Push Up", false, onConfirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("asks before deleting an exercise with logged sets", () => {
    const onConfirm = vi.fn();
    confirmDeleteExercise("Push Up", true, onConfirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Delete Push Up?",
      expect.stringContaining("logged sets"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Delete", style: "destructive" }),
      ]),
    );
  });
});

describe("requestExerciseReplacement", () => {
  beforeEach(() => {
    vi.mocked(Alert.alert).mockClear();
  });

  const target = {
    fromName: "Bench Press",
    toName: "Dip",
    hasLoggedSets: true,
  };

  it("replaces an unlogged exercise immediately", async () => {
    const onReplace = vi.fn().mockResolvedValue(undefined);
    await requestExerciseReplacement({
      ...target,
      hasLoggedSets: false,
      onReplace,
    });
    expect(onReplace).toHaveBeenCalledOnce();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "explains prescriptions, notes and completion before changing logged sets (completed workout: %s)",
    async (completedWorkout) => {
      const onReplace = vi.fn().mockResolvedValue(undefined);
      await requestExerciseReplacement({
        ...target,
        completedWorkout,
        onReplace,
      });
      expect(onReplace).not.toHaveBeenCalled();
      const [title, message, buttons] = vi.mocked(Alert.alert).mock.calls[0];
      expect(title).toBe("Replace Bench Press with Dip?");
      expect(message).toContain("same position and number of sets");
      expect(message).toContain("saved values for Dip, or start at 0");
      expect(message).toContain("workout note will be cleared");
      expect(message).toContain(
        completedWorkout
          ? "Completed sets will stay checked"
          : "Logged sets will be unchecked",
      );
      const cancel = buttons!.find((button) => button.text === "Cancel")!;
      expect(cancel.style).toBe("cancel");
      cancel.onPress?.();
      expect(onReplace).not.toHaveBeenCalled();
      buttons!.find((button) => button.text === "Replace")!.onPress!();
      expect(onReplace).toHaveBeenCalledOnce();
    },
  );

  it.each([false, true])(
    "shows a retry message if replacement fails (confirmation required: %s)",
    async (hasLoggedSets) => {
      const onReplace = vi.fn().mockRejectedValue(new Error("SQLite failure"));
      await requestExerciseReplacement({ ...target, hasLoggedSets, onReplace });
      if (hasLoggedSets) {
        const buttons = vi.mocked(Alert.alert).mock.calls[0][2]!;
        buttons.find((button) => button.text === "Replace")!.onPress!();
      }
      await vi.waitFor(() => {
        expect(Alert.alert).toHaveBeenLastCalledWith(
          "Couldn’t replace exercise",
          "Your change couldn’t be saved. Please try again.",
        );
      });
    },
  );
});
