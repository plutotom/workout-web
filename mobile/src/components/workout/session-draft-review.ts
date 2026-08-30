export function sessionDraftReviewCopy(
  draft: {
    removeSlugs: string[];
    add: { slug: string; sets: { weight: number; reps: number }[] }[];
  },
  short: (slug: string) => string,
): string {
  return [
    draft.removeSlugs.length
      ? `Remove: ${draft.removeSlugs.map(short).join(", ")}`
      : null,
    draft.add.length
      ? `Add: ${draft.add
          .map((exercise) => {
            const reps = exercise.sets.map((set) => set.reps);
            const sameReps = reps.every((rep) => rep === reps[0]);
            const summary =
              sameReps && (reps[0] ?? 0) > 0
                ? `${exercise.sets.length} × ${reps[0]}`
                : `${exercise.sets.length} sets`;
            return `${short(exercise.slug)} (${summary})`;
          })
          .join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
