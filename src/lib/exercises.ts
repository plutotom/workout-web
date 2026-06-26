// Display catalog for the fixed V1 lift set. Backend stores/validates the slug;
// names live here so the client can render them.
export type ExerciseSlug = "bench" | "squat" | "deadlift";

export const EXERCISES: { slug: ExerciseSlug; name: string; short: string }[] =
  [
    { slug: "bench", name: "Bench Press (Barbell)", short: "Bench" },
    { slug: "squat", name: "Squat (Barbell)", short: "Squat" },
    { slug: "deadlift", name: "Deadlift (Barbell)", short: "Deadlift" },
  ];

const bySlug = new Map(EXERCISES.map((e) => [e.slug, e]));

export const exerciseName = (slug: ExerciseSlug) =>
  bySlug.get(slug)?.name ?? slug;

export const exerciseShort = (slug: ExerciseSlug) =>
  bySlug.get(slug)?.short ?? slug;
