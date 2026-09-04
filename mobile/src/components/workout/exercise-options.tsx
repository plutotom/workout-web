import { MoreHorizontal } from "lucide-react-native";
import { ActionSheetIOS, Alert, Platform, Pressable } from "react-native";

import { colors } from "@/theme";

export type ExerciseOption = {
  label: string;
  onPress: () => void;
};

export function showExerciseOptions(actions: ExerciseOption[]) {
  if (actions.length === 0) return;

  const options = ["Cancel", ...actions.map((action) => action.label)];
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Exercise options",
        options,
        cancelButtonIndex: 0,
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
      onPress: action.onPress,
    })),
  ]);
}

export function machineOptionLabel(machineName: string | null) {
  return machineName ? `Machine · ${machineName}` : "Choose machine";
}

export function ExerciseOptionsButton({
  machineName,
  onChooseMachine,
}: {
  machineName: string | null;
  onChooseMachine: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Exercise options"
      hitSlop={7}
      onPress={() =>
        showExerciseOptions([
          {
            label: machineOptionLabel(machineName),
            onPress: onChooseMachine,
          },
        ])
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
