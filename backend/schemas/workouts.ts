import { defineTable } from "convex/server";
import { v } from "convex/values";

import { exerciseSlugValidator } from "./exercises";

export const sessionStatusValidator = v.union(
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("abandoned"),
);

export const workoutTables = {
  workoutSessions: defineTable({
    userId: v.id("users"),
    templateId: v.id("workoutTemplates"),
    status: sessionStatusValidator,
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  sessionExercises: defineTable({
    sessionId: v.id("workoutSessions"),
    exerciseSlug: exerciseSlugValidator,
    orderIndex: v.number(),
    // Schema-ready; per-exercise notes UI is deferred past V1.
    notes: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),

  sets: defineTable({
    sessionExerciseId: v.id("sessionExercises"),
    orderIndex: v.number(),
    reps: v.number(),
    weight: v.number(),
    completed: v.boolean(),
  }).index("by_session_exercise", ["sessionExerciseId"]),
};
