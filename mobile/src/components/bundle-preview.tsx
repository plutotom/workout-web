import { Text, View } from "react-native";

import { Card } from "@/components/ui";
import { colors } from "@/theme";
import {
  describeBundle,
  type WorkoutExportBundle,
} from "@shared/workout-export";

/** "3 × 5 @ 185lb" when every set matches, otherwise "5@185 · 3@205". */
function summarizeSets(
  sets: { weight: number; reps: number }[],
  unit: "lb" | "kg",
): string {
  if (sets.length === 0) return "—";
  const first = sets[0]!;
  const allSame = sets.every(
    (set) => set.weight === first.weight && set.reps === first.reps,
  );
  if (allSame) {
    return first.weight > 0
      ? `${sets.length} × ${first.reps} @ ${first.weight}${unit}`
      : `${sets.length} × ${first.reps}`;
  }
  return sets
    .map((set) =>
      set.weight > 0 ? `${set.reps}@${set.weight}` : `${set.reps}`,
    )
    .join(" · ");
}

/**
 * Read-only preview of an incoming export. Renders the names carried inside
 * the bundle rather than the local catalog, so the sender's custom lifts are
 * readable before they exist in this account.
 */
export function BundlePreview({ bundle }: { bundle: WorkoutExportBundle }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.dim, fontSize: 12 }}>
        {describeBundle(bundle)} · weights in {bundle.unit}
      </Text>

      {bundle.templates.map((template, index) => (
        <Card key={`${template.name}-${index}`}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {template.name}
          </Text>
          {template.exercises.map((exercise, exerciseIndex) => (
            <View
              key={`${exercise.slug}-${exerciseIndex}`}
              style={{ flexDirection: "row", gap: 12 }}
            >
              <Text
                numberOfLines={1}
                style={{ color: colors.dim, fontSize: 12, flex: 1 }}
              >
                {exercise.name}
              </Text>
              <Text style={{ color: colors.faint, fontSize: 12 }}>
                {summarizeSets(exercise.sets, bundle.unit)}
              </Text>
            </View>
          ))}
        </Card>
      ))}

      {bundle.customExercises.length > 0 ? (
        <Text style={{ color: colors.dim, fontSize: 11 }}>
          Includes {bundle.customExercises.length} custom{" "}
          {bundle.customExercises.length === 1 ? "lift" : "lifts"} that will be
          added to your exercise list:{" "}
          {bundle.customExercises.map((exercise) => exercise.name).join(", ")}.
        </Text>
      ) : null}
    </View>
  );
}
