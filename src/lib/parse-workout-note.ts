import { assertWorkoutNoteLength, type NoteUnit } from "./note-workouts";

export type NoteParserExercise = {
  slug: string;
  name: string;
  short?: string;
  aliases?: readonly string[];
  usesBar?: boolean;
  archived?: boolean;
};

type Source = { line: number; text: string };
export type ParsedNoteSet = {
  reps: number;
  weight: number | null;
  unit: NoteUnit;
  failedAttempt: boolean;
  /** Written syntax; plain weights use the selected exercise's logging convention. */
  weightNotation: "plain" | "per-dumbbell" | "plates-per-side";
  source: Source;
};
export type ParsedNoteExercise = {
  name: string;
  slug: string | null;
  candidates: string[];
  sets: ParsedNoteSet[];
  source: Source;
};
export type NoteParseIssue = {
  code:
    | "unknown-exercise"
    | "ambiguous-exercise"
    | "missing-exercise"
    | "invalid-set"
    | "missing-weight"
    | "missing-bar-weight"
    | "equipment-mismatch"
    | "unsupported-precision"
    | "exercise-limit"
    | "set-limit";
  message: string;
  source: Source;
};
export type ParsedWorkoutNote = {
  originalText: string;
  noteUnit: NoteUnit;
  exercises: ParsedNoteExercise[];
  issues: NoteParseIssue[];
};

function normalizedName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchingExercises(
  name: string,
  catalog: readonly NoteParserExercise[],
) {
  const key = normalizedName(name);
  // An exact catalog name or slug takes precedence over shared short names.
  const exact = catalog.filter(
    (exercise) =>
      normalizedName(exercise.name) === key ||
      normalizedName(exercise.slug) === key,
  );
  if (exact.length) return exact;
  return catalog.filter((exercise) =>
    [
      exercise.short ?? "",
      exercise.name.replace(/\([^)]*\)/g, ""),
      ...(exercise.aliases ?? []),
    ].some((alias) => normalizedName(alias) === key),
  );
}

/**
 * Produces a review draft, never saved sets. Numbers retain their written unit;
 * cross-unit conversion and rounding belong to the later confirmed apply step.
 * A plus expression means plates on each side, not ordinary field arithmetic.
 */
export function parseWorkoutNote(
  noteBody: string,
  options: {
    noteUnit: NoteUnit;
    catalog: readonly NoteParserExercise[];
    /** Bar weight in the note's unit. Confirmed default for lb notes is 45. */
    barWeight?: number;
  },
): ParsedWorkoutNote {
  assertWorkoutNoteLength(noteBody);
  if (
    options.barWeight !== undefined &&
    (!Number.isFinite(options.barWeight) || options.barWeight < 0)
  )
    throw new Error("Bar weight must be a finite nonnegative number");
  const result: ParsedWorkoutNote = {
    originalText: noteBody,
    noteUnit: options.noteUnit,
    exercises: [],
    issues: [],
  };
  const catalog = options.catalog.filter((exercise) => !exercise.archived);
  let current: ParsedNoteExercise | undefined;

  function issue(
    code: NoteParseIssue["code"],
    source: Source,
    message: string,
  ) {
    result.issues.push({ code, source, message });
  }

  function heading(name: string, source: Source) {
    current = { name, slug: null, candidates: [], sets: [], source };
    result.exercises.push(current);
    if (result.exercises.length === 51)
      issue(
        "exercise-limit",
        source,
        "Review required: at most 50 exercises can be saved.",
      );
  }

  function set(fragment: string, source: Source) {
    if (!current) {
      heading("", source);
      issue("missing-exercise", source, "Choose an exercise for these sets.");
    }
    const group = current!;
    const failedAttempt = /(?:fail|f)\s*$/i.test(fragment);
    const text = fragment.replace(/(?:fail|f)\s*$/i, "").trim();
    let repsText: string;
    let weightText: string;
    const at = text.match(/^(\d+)\s*@\s*(.+)$/);
    const times = text.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
    const bare = text.match(/^(\d+)\s+(.+)$/);
    if (at) [, repsText, weightText] = at;
    else if (times) [, weightText, repsText] = times;
    else if (bare) [, repsText, weightText] = bare;
    else if (/^\d+$/.test(text)) {
      repsText = text;
      weightText = "";
    } else {
      issue("invalid-set", source, "This set notation needs review.");
      return;
    }
    const reps = Number(repsText);
    if (!Number.isSafeInteger(reps) || reps < 1 || reps > 1_000) {
      issue(
        "invalid-set",
        source,
        "Completed reps must be between 1 and 1,000.",
      );
      return;
    }
    const explicitUnit = weightText.match(/\s*(lbs?|kg)\s*$/i);
    const unit: NoteUnit = explicitUnit
      ? explicitUnit[1].toLowerCase() === "kg"
        ? "kg"
        : "lb"
      : options.noteUnit;
    let expression = weightText.replace(/\s*(lbs?|kg)\s*$/i, "").trim();
    const dumbbell = /\d\s*s$/i.test(expression);
    if (dumbbell) expression = expression.replace(/\s*s$/i, "").trim();
    const plates = expression.includes("+");
    const weightNotation = plates
      ? "plates-per-side"
      : dumbbell
        ? "per-dumbbell"
        : "plain";
    let weight: number | null = null;
    if (!expression) {
      issue(
        "missing-weight",
        source,
        "Supply a weight or confirm this as a bodyweight set.",
      );
    } else if (
      !/^\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)*$/.test(expression) ||
      (plates && dumbbell)
    ) {
      issue("invalid-set", source, "This weight notation needs review.");
      return;
    } else {
      const parts = expression.split("+").map((value) => Number(value.trim()));
      if (plates) {
        const barWeight =
          options.barWeight ?? (options.noteUnit === "lb" ? 45 : undefined);
        if (barWeight === undefined || unit !== options.noteUnit) {
          issue(
            "missing-bar-weight",
            source,
            "Confirm the bar weight in the written unit before totaling plates.",
          );
        } else
          weight = barWeight + 2 * parts.reduce((sum, value) => sum + value, 0);
      } else weight = parts[0];
      if (
        weight !== null &&
        (!Number.isFinite(weight) || weight < 0 || weight > 10_000)
      ) {
        issue("invalid-set", source, "Weight must be between 0 and 10,000.");
        return;
      } else if (weight !== null && !Number.isInteger(weight)) {
        issue(
          "unsupported-precision",
          source,
          "Review this fractional weight before saving to whole-number set fields.",
        );
      }
    }
    group.sets.push({
      reps,
      weight,
      unit,
      failedAttempt,
      weightNotation,
      source,
    });
    if (group.sets.length === 21)
      issue(
        "set-limit",
        source,
        "Review required: at most 20 sets per exercise can be saved.",
      );
  }

  noteBody.split(/\r\n|\n|\r/).forEach((original, index) => {
    const source = { line: index + 1, text: original };
    const text = original.trim();
    if (!text || /^[-—–_]{2,}$/.test(text)) {
      // A separator ends a section; ordinary blank lines need not end a heading.
      if (text) current = undefined;
      return;
    }
    const colon = text.indexOf(":");
    if (colon > 0 && /^[a-z]/i.test(text)) {
      heading(text.slice(0, colon).trim(), source);
      const remainder = text.slice(colon + 1).trim();
      if (remainder)
        remainder
          .split(",")
          .forEach((fragment) => set(fragment.trim(), source));
    } else if (/^[a-z]/i.test(text) && !/\d/.test(text)) {
      heading(text, source);
    } else {
      const rows = text.replace(/^[-•]\s*/, "").split(",");
      rows.forEach((fragment) => set(fragment.trim(), source));
    }
  });

  for (const group of result.exercises) {
    if (!group.name) continue;
    let matches = matchingExercises(group.name, catalog);
    const hasPlates = group.sets.some(
      (row) => row.weightNotation === "plates-per-side",
    );
    const hasDumbbells = group.sets.some(
      (row) => row.weightNotation === "per-dumbbell",
    );
    if (hasPlates && hasDumbbells) {
      issue(
        "equipment-mismatch",
        group.source,
        "This section mixes dumbbell and barbell notation; review the exercise selection.",
      );
    } else if (hasPlates || hasDumbbells) {
      const filtered = matches.filter((exercise) =>
        hasPlates
          ? exercise.usesBar === true || /\(barbell\)/i.test(exercise.name)
          : /\(dumbbell\)/i.test(exercise.name),
      );
      if (matches.length && !filtered.length) {
        issue(
          "equipment-mismatch",
          group.source,
          "The written weights do not match this exercise's equipment.",
        );
      }
      matches = filtered;
    }
    group.candidates = [...new Set(matches.map((exercise) => exercise.slug))];
    if (group.candidates.length === 1 && !(hasPlates && hasDumbbells)) {
      group.slug = group.candidates[0];
    } else {
      issue(
        group.candidates.length ? "ambiguous-exercise" : "unknown-exercise",
        group.source,
        group.candidates.length
          ? "Choose which catalog exercise this name means."
          : "Choose a catalog or custom exercise for this heading.",
      );
    }
  }
  return result;
}
