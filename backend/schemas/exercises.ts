import { defineTable } from "convex/server";
import { v } from "convex/values";

// Informational — the curated catalog lives client-side in src/lib/exercises.ts.
// Custom (user-authored) exercises live in the customExercises table below and
// are referenced by the synthetic slug `custom:<doc._id>`. Slugs are open
// strings everywhere they're stored (templates, sessions) to support both.
export const EXERCISE_SLUGS = ["bench", "squat", "deadlift"] as const;

export const exerciseSlugValidator = v.string();

/** Mirror of the client-side MuscleGroup union (src/lib/exercises.ts). */
export const muscleGroupValidator = v.union(
  v.literal("chest"),
  v.literal("back"),
  v.literal("legs"),
  v.literal("shoulders"),
  v.literal("arms"),
  v.literal("core"),
);

export const exerciseTables = {
  // Per-user custom lifts. Visible only to their owner. "Deleting" sets
  // archived: true (soft-delete) so historical templates/sessions that still
  // reference the slug can keep resolving its name.
  customExercises: defineTable({
    userId: v.id("users"),
    name: v.string(),
    short: v.optional(v.string()),
    category: muscleGroupValidator,
    usesBar: v.boolean(),
    archived: v.boolean(),
  }).index("by_user", ["userId"]),

  // Per-user notes keyed by exercise slug — shared across templates and workouts.
  exerciseNotes: defineTable({
    userId: v.id("users"),
    exerciseSlug: exerciseSlugValidator,
    notes: v.string(),
  }).index("by_user_slug", ["userId", "exerciseSlug"]),
};
