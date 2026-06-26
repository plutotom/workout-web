import { v } from "convex/values";

// V1 exercise catalog is a fixed set of three barbell lifts (locked decision),
// so it lives as a constant + validator rather than a seeded table. Display
// names are resolved on the client from the matching slug.
export const EXERCISE_SLUGS = ["bench", "squat", "deadlift"] as const;

export const exerciseSlugValidator = v.union(
  v.literal("bench"),
  v.literal("squat"),
  v.literal("deadlift"),
);
