import { describeBundle, type WorkoutExportBundle } from "@/lib/workout-export";

/**
 * Read-only preview of an incoming export, shown before anything is written.
 *
 * Renders from the names carried inside the bundle rather than the catalog, so
 * it works on the public share page where the viewer may be signed out (and may
 * not have the sender's custom lifts at all).
 */
export function BundlePreview({ bundle }: { bundle: WorkoutExportBundle }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {describeBundle(bundle)} · weights in {bundle.unit}
      </p>

      {bundle.templates.map((template, index) => (
        <div
          key={`${template.name}-${index}`}
          className="rounded-lg border bg-[var(--surface)] p-3"
        >
          <p className="text-sm font-semibold">{template.name}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {template.exercises.map((exercise, exerciseIndex) => (
              <li
                key={`${exercise.slug}-${exerciseIndex}`}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <span className="min-w-0 truncate">{exercise.name}</span>
                <span className="text-muted-foreground shrink-0 font-mono">
                  {summarizeSets(exercise.sets, bundle.unit)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {bundle.customExercises.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Includes {bundle.customExercises.length} custom{" "}
          {bundle.customExercises.length === 1 ? "lift" : "lifts"} that will be
          added to your exercise list:{" "}
          {bundle.customExercises.map((exercise) => exercise.name).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

/** "3 × 185" when every set matches, otherwise "185/205/205". */
function summarizeSets(
  sets: { weight: number; reps: number }[],
  unit: "lb" | "kg",
): string {
  if (sets.length === 0) return "—";
  const allSame = sets.every(
    (set) => set.weight === sets[0]!.weight && set.reps === sets[0]!.reps,
  );
  if (allSame) {
    const { weight, reps } = sets[0]!;
    return weight > 0
      ? `${sets.length} × ${reps} @ ${weight}${unit}`
      : `${sets.length} × ${reps}`;
  }
  return sets
    .map((set) =>
      set.weight > 0 ? `${set.reps}@${set.weight}` : `${set.reps}`,
    )
    .join(" · ");
}
