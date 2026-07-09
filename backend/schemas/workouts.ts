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
    // Optional: blank / quick-start sessions have no template until the user
    // chooses "Save as template" after finishing.
    templateId: v.optional(v.id("workoutTemplates")),
    // Snapshot of the template name at start/save time so history survives
    // template deletion.
    templateName: v.optional(v.string()),
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
    restSeconds: v.optional(v.number()),
    // Schema-ready; per-exercise notes UI is deferred past V1.
    notes: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),

  sets: defineTable({
    sessionExerciseId: v.id("sessionExercises"),
    orderIndex: v.number(),
    targetReps: v.optional(v.number()),
    targetWeight: v.optional(v.number()),
    reps: v.number(),
    weight: v.number(),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
  }).index("by_session_exercise", ["sessionExerciseId"]),
};
