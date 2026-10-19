import { MoreHorizontal } from "lucide-react-native";
import { ActionSheetIOS, Alert, Platform, Pressable } from "react-native";

import { deleteExerciseConfirmMessage } from "@shared/replace-exercise";
import { colors } from "@/theme";

export type ExerciseOption = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export function exerciseOptionItems({
  machineName,
  onChooseMachine,
  onReplace,
  onDelete,
}: {
  machineName?: string | null;
  onChooseMachine?: () => void;
  onReplace?: () => void;
  onDelete?: () => void;
}): ExerciseOption[] {
  const actions: ExerciseOption[] = [];
  if (onReplace) actions.push({ label: "Replace", onPress: onReplace });
  if (onChooseMachine) {
    actions.push({
      label: machineOptionLabel(machineName ?? null),
      onPress: onChooseMachine,
    });
  }
  if (onDelete) {
    actions.push({
      label: "Delete exercise",
      onPress: onDelete,
      destructive: true,
    });
  }
  return actions;
}

export function showExerciseOptions(actions: ExerciseOption[]) {
  if (actions.length === 0) return;

  const options = ["Cancel", ...actions.map((action) => action.label)];
  const destructiveIndex = actions.findIndex((action) => action.destructive);
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Exercise options",
        options,
        cancelButtonIndex: 0,
        ...(destructiveIndex >= 0
          ? { destructiveButtonIndex: destructiveIndex + 1 }
          : {}),
      },
      (index) => {
        if (index == null || index === 0) return;
        actions[index - 1]?.onPress();
      },
    );
    return;
  }

  Alert.alert("Exercise options", undefined, [
    { text: "Cancel", style: "cancel" },
    ...actions.map((action) => ({
      text: action.label,
      style: (action.destructive ? "destructive" : "default") as
        | "destructive"
        | "default",
      onPress: action.onPress,
    })),
  ]);
}

export function machineOptionLabel(machineName: string | null) {
  return machineName ? `Machine · ${machineName}` : "Choose machine";
}

export function confirmDeleteExercise(
  name: string,
  hasLoggedSets: boolean,
  onConfirm: () => void,
) {
  if (!hasLoggedSets) {
    onConfirm();
    return;
  }
  Alert.alert(`Delete ${name}?`, deleteExerciseConfirmMessage(name), [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
}

export function ExerciseOptionsButton({
  machineName,
  onChooseMachine,
  onReplace,
  onDelete,
}: {
  machineName?: string | null;
  onChooseMachine?: () => void;
  onReplace?: () => void;
  onDelete?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Exercise options"
      hitSlop={7}
      onPress={() =>
        showExerciseOptions(
          exerciseOptionItems({
            machineName,
            onChooseMachine,
            onReplace,
            onDelete,
          }),
        )
      }
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <MoreHorizontal size={20} color={colors.dim} />
    </Pressable>
  );
}
