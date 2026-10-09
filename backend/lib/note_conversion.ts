import { EXERCISES } from "../../src/lib/exercises";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { polar } from "../routes/billing/polar";
import { listCustomExercises } from "./exercises";
import { isProUser } from "./plan";

export function isConvertedNote(session: {
  inputMode?: string;
  noteBody?: string | null;
}) {
  return (
    (session.inputMode ?? "list") === "list" &&
    Boolean(session.noteBody?.trim())
  );
}

/** Both the live subscription and existing verified/manual grants count as Pro. */
export async function requireNoteConversionPro(
  ctx: MutationCtx,
  user: Doc<"users">,
) {
  if (isProUser(user)) return;
  const subscription = await polar
    .getCurrentSubscription(ctx, { userId: user._id })
    .catch(() => null);
  if (subscription?.status !== "active" && subscription?.status !== "trialing")
    throw new Error("Note conversion requires Pro.");
}

/** Validate credited work at the sync boundary, including custom-lift ownership. */
export async function validateNoteConversion(
  ctx: MutationCtx,
  user: Doc<"users">,
  session: {
    status: string;
    sessionKind?: string;
    noteBody?: string | null;
    noteUnit?: string | null;
    exercises: {
      slug: string;
      sets: { weight: number; reps: number; completed: boolean }[];
    }[];
  },
) {
  if (
    session.status !== "completed" ||
    (session.sessionKind ?? "tracked") !== "tracked" ||
    !session.noteBody?.trim() ||
    (session.noteUnit !== "lb" && session.noteUnit !== "kg")
  )
    throw new Error(
      "Conversion must preserve a completed workout’s original note and unit.",
    );
  const catalog = new Set([
    ...EXERCISES.map((exercise) => exercise.slug),
    ...(await listCustomExercises(ctx, user._id))
      .filter((exercise) => !exercise.archived)
      .map((exercise) => exercise.slug),
  ]);
  if (!session.exercises.length)
    throw new Error("Conversion requires completed sets.");
  for (const exercise of session.exercises) {
    if (!catalog.has(exercise.slug))
      throw new Error("Choose one of your active exercises.");
    if (!exercise.sets.length)
      throw new Error("Each converted exercise needs completed sets.");
    for (const set of exercise.sets) {
      if (
        !set.completed ||
        !Number.isInteger(set.reps) ||
        set.reps < 1 ||
        set.reps > 1_000 ||
        !Number.isInteger(set.weight) ||
        set.weight < 0 ||
        set.weight > 10_000
      )
        throw new Error(
          "Conversion requires valid completed reps and whole-number weights.",
        );
    }
  }
}
