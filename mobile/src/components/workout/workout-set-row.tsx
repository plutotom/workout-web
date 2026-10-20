import { useRef, useState } from "react";
import { Check, CircleDot } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Field } from "@/components/ui";
import { PlateModal } from "@/components/workout/plate-modal";
import type { LocalWorkoutSet } from "@/data/local/types";
import { colors } from "@/theme";
import { usePersistedDraft } from "@/hooks/use-persisted-draft";

type SetValues = Pick<LocalWorkoutSet, "weight" | "reps">;
type SetChanges = Partial<SetValues>;

type WorkoutSetRowProps = {
  exerciseSlug: string;
  set: LocalWorkoutSet;
  index: number;
  unit: "lb" | "kg";
  barWeight: number;
  usesBar: boolean;
  onCommit: (values: SetChanges) => Promise<unknown>;
  onComplete: (completed: boolean, values: SetChanges) => Promise<unknown>;
  onDelete: () => void;
  canDelete: boolean;
};

export function WorkoutSetRow({ exerciseSlug, ...props }: WorkoutSetRowProps) {
  // Replacement preserves database ids, but drafts belong to the old lift.
  return (
    <WorkoutSetRowFields key={`${exerciseSlug}:${props.set._id}`} {...props} />
  );
}

function WorkoutSetRowFields({
  set,
  index,
  unit,
  barWeight,
  usesBar,
  onCommit,
  onComplete,
  onDelete,
  canDelete,
}: Omit<WorkoutSetRowProps, "exerciseSlug">) {
  const weight = usePersistedDraft(String(set.weight || ""));
  const reps = usePersistedDraft(String(set.reps || ""));
  const [error, setError] = useState<string | null>(null);
  const [plates, setPlates] = useState(false);
  const saveSequence = useRef(0);
  const values = {
    weight: Number(weight.value) || 0,
    reps: Number(reps.value) || 0,
  };
  const changes: SetChanges = {};
  if (values.weight !== Number(weight.baseline)) changes.weight = values.weight;
  if (values.reps !== Number(reps.baseline)) changes.reps = values.reps;

  async function commit(
    patch = changes,
    complete?: boolean,
    appliedWeight?: string,
  ) {
    if (Object.keys(patch).length === 0 && complete === undefined) {
      // Discard formatting-only changes on blur without creating a write.
      weight.change(weight.baseline);
      reps.change(reps.baseline);
      return;
    }
    const acknowledgeWeight =
      patch.weight !== undefined
        ? weight.prepareSave(
            String(patch.weight || ""),
            appliedWeight ?? weight.value,
          )
        : undefined;
    const acknowledgeReps =
      patch.reps !== undefined
        ? reps.prepareSave(String(patch.reps || ""))
        : undefined;
    const sequence = ++saveSequence.current;
    try {
      if (complete === undefined) await onCommit(patch);
      else await onComplete(complete, patch);
      acknowledgeWeight?.acknowledge();
      acknowledgeReps?.acknowledge();
      if (sequence === saveSequence.current) setError(null);
    } catch (caught) {
      acknowledgeWeight?.reject();
      acknowledgeReps?.reject();
      if (sequence === saveSequence.current)
        setError(
          caught instanceof Error
            ? caught.message
            : "Couldn’t save this set. Try again.",
        );
    }
  }
  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          opacity: set.completed ? 0.76 : 1,
        }}
      >
        <Pressable
          onLongPress={canDelete ? onDelete : undefined}
          style={{
            width: 34,
            height: 42,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: set.completed
              ? `${colors.success}22`
              : colors.surface2,
          }}
        >
          <Text
            style={{
              color: set.completed ? colors.success : colors.dim,
              fontWeight: "700",
            }}
          >
            {index + 1}
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Field
            value={weight.value}
            accessibilityLabel={`Set ${index + 1} weight`}
            onChangeText={(value) => {
              weight.change(value.replace(/[^0-9.]/g, ""));
              setError(null);
            }}
            onBlur={() => void commit()}
            keyboardType="decimal-pad"
            placeholder="0"
          />
        </View>
        {usesBar ? (
          <Pressable onPress={() => setPlates(true)} hitSlop={5}>
            <CircleDot size={17} color={colors.dim} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1 }}>
          <Field
            value={reps.value}
            accessibilityLabel={`Set ${index + 1} reps`}
            onChangeText={(value) => {
              reps.change(value.replace(/\D/g, ""));
              setError(null);
            }}
            onBlur={() => void commit()}
            keyboardType="number-pad"
            placeholder="0"
          />
        </View>
        <Pressable
          onPress={() => void commit(changes, !set.completed)}
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: set.completed ? colors.success : colors.input,
            backgroundColor: set.completed ? colors.success : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check
            size={21}
            strokeWidth={3}
            color={set.completed ? colors.bg : colors.faint}
          />
        </Pressable>
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.danger, fontSize: 12 }}
        >
          {error}
        </Text>
      ) : null}
      <PlateModal
        visible={plates}
        target={values.weight}
        unit={unit}
        barWeight={barWeight}
        onClose={() => setPlates(false)}
        onApply={(next) => {
          weight.change(String(next));
          void commit({ ...changes, weight: next }, undefined, String(next));
        }}
      />
    </>
  );
}
