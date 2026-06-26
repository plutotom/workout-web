import { defineTable } from "convex/server";
import { v } from "convex/values";

import { exerciseSlugValidator } from "./exercises";

export const templateTables = {
  workoutTemplates: defineTable({
    userId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  templateExercises: defineTable({
    templateId: v.id("workoutTemplates"),
    exerciseSlug: exerciseSlugValidator,
    orderIndex: v.number(),
    // Per-set presets. 0 means "no preset" for that field.
    sets: v.array(v.object({ weight: v.number(), reps: v.number() })),
  }).index("by_template", ["templateId"]),
};
