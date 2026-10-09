import type { NoteUnit } from "./note-workouts";
import { convertWeight } from "./workout-export";
import {
  parseWorkoutNote,
  type NoteParserExercise,
  type ParsedNoteSet,
} from "./parse-workout-note";

export type NotePreviewSet = Omit<ParsedNoteSet, "reps" | "weight"> & {
  id: string;
  reps: string;
  weight: string;
};
export type NotePreviewExercise = {
  id: string;
  name: string;
  slug: string | null;
  candidates: string[];
  sets: NotePreviewSet[];
};
export type NoteConversionPreview = {
  originalText: string;
  noteUnit: NoteUnit;
  exercises: NotePreviewExercise[];
  unparsed: {
    id: string;
    source: ParsedNoteSet["source"];
    message: string;
    keptAsNote: boolean;
  }[];
};

/** Use the same confirmed shorthand in the app and the example corpus. */
export function workoutNoteCatalog(catalog: readonly NoteParserExercise[]) {
  return catalog.map((exercise) => ({
    ...exercise,
    aliases: [
      ...(exercise.aliases ?? []),
      ...(exercise.slug === "squat"
        ? ["Back squat"]
        : exercise.slug === "ohp" || exercise.slug === "overhead-press-dumbbell"
          ? ["Strict press", "Press"]
          : []),
    ],
  }));
}

/** A disposable UI draft. Creating or editing it never writes workout data. */
export function createNoteConversionPreview(
  originalText: string,
  noteUnit: NoteUnit,
  catalog: readonly NoteParserExercise[],
): NoteConversionPreview {
  const parsed = parseWorkoutNote(originalText, {
    noteUnit,
    catalog: workoutNoteCatalog(catalog),
  });
  const unparsed = new Map<number, NoteConversionPreview["unparsed"][number]>();
  for (const issue of parsed.issues) {
    if (issue.code !== "invalid-set") continue;
    unparsed.set(issue.source.line, {
      id: `line-${issue.source.line}`,
      source: issue.source,
      message: issue.message,
      keptAsNote: false,
    });
  }
  return {
    originalText,
    noteUnit,
    exercises: parsed.exercises.map((exercise, index) => ({
      id: `exercise-${index}`,
      name: exercise.name,
      slug: exercise.slug,
      candidates: exercise.candidates,
      sets: exercise.sets.map((set, setIndex) => ({
        ...set,
        id: `exercise-${index}-set-${setIndex}`,
        reps: String(set.reps),
        weight: set.weight === null ? "" : String(set.weight),
      })),
    })),
    unparsed: [...unparsed.values()],
  };
}

export type NotePreviewReviewItem = {
  exerciseId?: string;
  setId?: string;
  lineId?: string;
  message: string;
};

/** Recompute review items from edits; resolved parser warnings must not linger. */
export function reviewNoteConversionPreview(
  draft: NoteConversionPreview,
  catalog: readonly NoteParserExercise[],
  targetUnit: NoteUnit = draft.noteUnit,
): NotePreviewReviewItem[] {
  const items: NotePreviewReviewItem[] = [];
  const bySlug = new Map(
    catalog.filter((exercise) => !exercise.archived).map((e) => [e.slug, e]),
  );
  if (!draft.exercises.length)
    items.push({ message: "Add an exercise and its completed sets." });
  if (draft.exercises.length > 50)
    items.push({ message: "Keep at most 50 exercises in the preview." });
  for (const group of draft.exercises) {
    const exercise = group.slug ? bySlug.get(group.slug) : undefined;
    const groupIssue = (message: string) =>
      items.push({ exerciseId: group.id, message });
    if (!exercise) groupIssue("Choose an exercise for this section.");
    if (!group.sets.length) groupIssue("Add a set or remove this section.");
    if (group.sets.length > 20)
      groupIssue("Keep at most 20 sets for this exercise.");
    for (const set of group.sets) {
      const setIssue = (message: string) =>
        items.push({ exerciseId: group.id, setId: set.id, message });
      if (!/^\d+$/.test(set.reps) || +set.reps < 1 || +set.reps > 1_000)
        setIssue("Enter 1–1,000 completed reps.");
      if (
        !/^\d+(?:\.\d+)?$/.test(set.weight) ||
        !Number.isFinite(+set.weight) ||
        +set.weight > 10_000
      )
        setIssue("Enter a weight from 0–10,000. Use 0 for bodyweight.");
      else if (!Number.isInteger(+set.weight))
        setIssue(
          "Fractional weight needs review; saved sets use whole numbers.",
        );
      else if (convertWeight(+set.weight, set.unit, targetUnit) > 10_000)
        setIssue(`Converted weight must be at most 10,000 ${targetUnit}.`);
      if (
        exercise &&
        ((set.weightNotation === "per-dumbbell" &&
          (exercise.usesBar === true || /\(barbell\)/i.test(exercise.name))) ||
          (set.weightNotation === "plates-per-side" &&
            (exercise.usesBar === false ||
              /\(dumbbell\)/i.test(exercise.name))))
      )
        setIssue("Choose an exercise that matches the written equipment.");
    }
  }
  for (const line of draft.unparsed) {
    if (!line.keptAsNote)
      items.push({
        lineId: line.id,
        message: "Review this unrecognized line.",
      });
  }
  return items;
}

/** The apply contract contains only reviewed work; it never pads or seeds sets. */
export function confirmNoteConversion(
  draft: NoteConversionPreview,
  catalog: readonly NoteParserExercise[],
  targetUnit: NoteUnit,
) {
  if (draft.noteUnit !== "lb" && draft.noteUnit !== "kg")
    throw new Error("Choose the note’s written unit.");
  if (targetUnit !== "lb" && targetUnit !== "kg")
    throw new Error("Invalid saved weight unit.");
  if (
    draft.exercises.some((group) =>
      group.sets.some(
        (set) =>
          (set.unit !== "lb" && set.unit !== "kg") ||
          typeof set.failedAttempt !== "boolean",
      ),
    )
  )
    throw new Error("Invalid set unit or failed-attempt annotation.");
  const review = reviewNoteConversionPreview(draft, catalog, targetUnit);
  if (review.length) throw new Error(review[0].message);
  return draft.exercises.map((group) => ({
    slug: group.slug!,
    // Failure belongs to the attempt after the credited reps, never an extra set.
    notes: group.sets
      .flatMap((set, index) =>
        set.failedAttempt
          ? [
              `Set ${index + 1}: failed attempt after ${set.reps} completed reps.`,
            ]
          : [],
      )
      .join("\n"),
    sets: group.sets.map((set) => ({
      reps: Number(set.reps),
      weight: convertWeight(Number(set.weight), set.unit, targetUnit),
    })),
  }));
}
