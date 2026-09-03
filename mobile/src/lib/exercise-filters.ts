import { ActionSheetIOS, Alert, Platform } from "react-native";

import type { MuscleGroup } from "@shared/exercises";
import { MUSCLE_GROUPS } from "@shared/exercises";
import { EXERCISE_SORTS, type ExerciseSort } from "@shared/exercise-browser";

export function pickMuscleGroup(
  current: MuscleGroup | "all",
  onPick: (value: MuscleGroup | "all") => void,
) {
  const options = [
    "Cancel",
    "All muscles",
    ...MUSCLE_GROUPS.map((g) => g.label),
  ];
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
      },
      (index) => {
        if (index === 0 || index == null) return;
        if (index === 1) {
          onPick("all");
          return;
        }
        const group = MUSCLE_GROUPS[index - 2];
        if (group) onPick(group.id);
      },
    );
    return;
  }

  Alert.alert("Muscle group", undefined, [
    { text: "Cancel", style: "cancel" },
    {
      text: "All muscles",
      onPress: () => onPick("all"),
      style: current === "all" ? "default" : undefined,
    },
    ...MUSCLE_GROUPS.map((group) => ({
      text: group.label,
      onPress: () => onPick(group.id),
    })),
  ]);
}

export function pickExerciseSort(
  current: ExerciseSort,
  onPick: (value: ExerciseSort) => void,
) {
  const options = ["Cancel", ...EXERCISE_SORTS.map((s) => s.label)];
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
      },
      (index) => {
        if (index === 0 || index == null) return;
        const sort = EXERCISE_SORTS[index - 1];
        if (sort) onPick(sort.id);
      },
    );
    return;
  }

  Alert.alert("Sort", undefined, [
    { text: "Cancel", style: "cancel" },
    ...EXERCISE_SORTS.map((sort) => ({
      text: sort.label,
      onPress: () => onPick(sort.id),
      style: current === sort.id ? ("default" as const) : undefined,
    })),
  ]);
}

export function muscleFilterLabel(group: MuscleGroup | "all") {
  if (group === "all") return "All muscles";
  return MUSCLE_GROUPS.find((g) => g.id === group)?.label ?? group;
}
