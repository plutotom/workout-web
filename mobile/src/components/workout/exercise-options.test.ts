import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { confirmDeleteExercise, exerciseOptionItems } from "./exercise-options";

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
