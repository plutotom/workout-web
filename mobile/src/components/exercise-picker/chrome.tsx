import { Check, Plus, Search, X } from "lucide-react-native";
import { useMemo, useSyncExternalStore } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Exercise } from "@shared/exercises";
import { KeyboardStickyFooter } from "@/components/keyboard-sticky-footer";
import { Button, EmptyState } from "@/components/ui";
import { useLocalCustomExercises, useLocalData } from "@/data/local/provider";
import { useLocalInsightsLifts } from "@/data/local/use-local-insights";
import {
  EXERCISE_PICKER_STYLES,
  exercisePickerStyleAllowed,
  exercisePickerStyleLabel,
  readExercisePickerStyle,
  subscribeExercisePickerStyle,
  writeExercisePickerStyle,
  type ExercisePickerStyle,
} from "@/lib/exercise-picker-style";
import { colors, radius } from "@/theme";

import { addLabel, type UsageMaps } from "./model";

export function useExercisePickerStyle(): ExercisePickerStyle {
  return useSyncExternalStore(
    subscribeExercisePickerStyle,
    readExercisePickerStyle,
    readExercisePickerStyle,
  );
}

export function DevPickerStyleButton() {
  const style = useExercisePickerStyle();
  if (!exercisePickerStyleAllowed()) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Choose add-exercise picker style"
      onPress={showExercisePickerStyleSheet}
      hitSlop={8}
      style={{
        alignSelf: "flex-start",
        minHeight: 32,
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.dim, fontSize: 12, fontWeight: "600" }}>
        Dev · {exercisePickerStyleLabel(style)}
      </Text>
    </Pressable>
  );
}

export function showExercisePickerStyleSheet() {
  if (!exercisePickerStyleAllowed()) return;
  const current = readExercisePickerStyle();
  const options = [
    "Cancel",
    ...EXERCISE_PICKER_STYLES.map((style) =>
      style.id === current ? `${style.label} ✓` : style.label,
    ),
  ];
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Add exercise picker style",
        options,
        cancelButtonIndex: 0,
      },
      (index) => {
        if (index === 0 || index == null) return;
        const next = EXERCISE_PICKER_STYLES[index - 1];
        if (next) writeExercisePickerStyle(next.id);
      },
    );
    return;
  }
  Alert.alert("Add exercise picker style", undefined, [
    { text: "Cancel", style: "cancel" },
    ...EXERCISE_PICKER_STYLES.map((style) => ({
      text: style.label,
      onPress: () => writeExercisePickerStyle(style.id),
    })),
  ]);
}

export function useExerciseUsage(): UsageMaps {
  const lifts = useLocalInsightsLifts(null);
  return useMemo(() => {
    const lastUsedAt = new Map<string, number>();
    const sessionCount = new Map<string, number>();
    for (const lift of lifts ?? []) {
      lastUsedAt.set(lift.slug, lift.lastCompletedAt);
      sessionCount.set(lift.slug, lift.sessionCount);
    }
    return { lastUsedAt, sessionCount };
  }, [lifts]);
}

export function useArchiveCustom() {
  const { archiveCustomExercise } = useLocalData();
  const customExercises = useLocalCustomExercises();
  const localIdBySlug = useMemo(
    () => new Map((customExercises ?? []).map((item) => [item.slug, item._id])),
    [customExercises],
  );
  return (slug: string, name: string) => {
    const exerciseId = localIdBySlug.get(slug);
    if (!exerciseId) return;
    Alert.alert(
      "Archive custom exercise?",
      `${name} will disappear from pickers but stay in workout history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => void archiveCustomExercise(exerciseId),
        },
      ],
    );
  };
}

export function SearchField({
  value,
  onChangeText,
  autoFocus,
  onFocus,
  placeholder = "Search exercises",
}: {
  value: string;
  onChangeText: (value: string) => void;
  autoFocus?: boolean;
  onFocus?: () => void;
  placeholder?: string;
}) {
  return (
    <View
      style={{
        height: 44,
        borderRadius: radius.md,
        borderColor: colors.input,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 9,
        paddingHorizontal: 12,
      }}
    >
      <Search size={17} color={colors.dim} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={{ flex: 1, color: colors.text, fontSize: 16 }}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        onFocus={onFocus}
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10}>
          <X size={16} color={colors.dim} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyPicker({
  query,
  onCreate,
}: {
  query: string;
  onCreate: () => void;
}) {
  const searching = query.trim().length > 0;
  return (
    <View style={{ padding: 16 }}>
      <EmptyState
        title={searching ? "No matching exercises" : "Nothing to add"}
        description={
          searching
            ? `Nothing matches “${query.trim()}”. Create a custom lift?`
            : "Every catalog exercise is already in this workout."
        }
        action={
          <Button
            label="New custom exercise"
            variant="outline"
            icon={Plus}
            onPress={onCreate}
          />
        }
      />
    </View>
  );
}

export function AddFooter({
  mode,
  selectedCount,
  onPress,
}: {
  mode: "add" | "replace";
  selectedCount: number;
  onPress: () => void;
}) {
  return (
    <KeyboardStickyFooter
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 0,
        paddingTop: 4,
      }}
    >
      <Button
        label={addLabel(mode, selectedCount)}
        size="lg"
        disabled={!selectedCount}
        onPress={onPress}
      />
    </KeyboardStickyFooter>
  );
}

export function SelectRow({
  exercise,
  active,
  onPress,
  onLongPress,
  accessory = "check",
  meta,
}: {
  exercise: Exercise;
  active?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessory?: "check" | "none" | "plus";
  meta?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 13,
        minHeight: 52,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      {accessory === "check" ? (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: active ? colors.action : colors.input,
            backgroundColor: active ? colors.action : "transparent",
          }}
        >
          {active ? (
            <Check size={17} color={colors.actionText} strokeWidth={3} />
          ) : null}
        </View>
      ) : accessory === "plus" ? (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.input,
          }}
        >
          <Plus size={16} color={colors.dim} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
          {exercise.name}
        </Text>
        <Text
          style={{
            color: colors.dim,
            fontSize: 11,
            marginTop: 3,
            textTransform: meta ? "none" : "capitalize",
          }}
        >
          {meta ??
            `${exercise.category}${exercise.custom ? " · custom · hold to archive" : ""}`}
        </Text>
      </View>
    </Pressable>
  );
}
