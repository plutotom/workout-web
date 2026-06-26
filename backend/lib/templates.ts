import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { exerciseSlugValidator } from "../schemas/exercises";

export const exerciseInputValidator = v.object({
  slug: exerciseSlugValidator,
  sets: v.array(v.object({ weight: v.number(), reps: v.number() })),
});

export type ExerciseInput = {
  slug: "bench" | "squat" | "deadlift";
  sets: { weight: number; reps: number }[];
};

const clampWhole = (n: number) => Math.max(0, Math.round(n));

export function normalizeTemplateSets(
  sets: { weight: number; reps: number }[],
) {
  const cleaned = sets
    .slice(0, 20)
    .map((s) => ({ weight: clampWhole(s.weight), reps: clampWhole(s.reps) }));
  return cleaned.length ? cleaned : [{ weight: 0, reps: 0 }];
}

export async function createTemplate(
  ctx: MutationCtx,
  userId: Id<"users">,
  { name, exercises }: { name: string; exercises: ExerciseInput[] },
) {
  const now = Date.now();
  const templateId = await ctx.db.insert("workoutTemplates", {
    userId,
    name: name.trim() || "Untitled",
    createdAt: now,
    updatedAt: now,
  });
  await Promise.all(
    exercises.map((e, i) =>
      ctx.db.insert("templateExercises", {
        templateId,
        exerciseSlug: e.slug,
        orderIndex: i,
        sets: normalizeTemplateSets(e.sets),
      }),
    ),
  );
  return templateId;
}

export async function updateTemplate(
  ctx: MutationCtx,
  userId: Id<"users">,
  {
    templateId,
    name,
    exercises,
  }: {
    templateId: Id<"workoutTemplates">;
    name: string;
    exercises: ExerciseInput[];
  },
) {
  const template = await ctx.db.get(templateId);
  if (!template || template.userId !== userId)
    throw new Error("Template not found");

  await ctx.db.patch(templateId, {
    name: name.trim() || "Untitled",
    updatedAt: Date.now(),
  });

  const existing = await ctx.db
    .query("templateExercises")
    .withIndex("by_template", (q) => q.eq("templateId", templateId))
    .collect();
  await Promise.all(existing.map((e) => ctx.db.delete(e._id)));
  await Promise.all(
    exercises.map((e, i) =>
      ctx.db.insert("templateExercises", {
        templateId,
        exerciseSlug: e.slug,
        orderIndex: i,
        sets: normalizeTemplateSets(e.sets),
      }),
    ),
  );
}

export async function removeTemplate(
  ctx: MutationCtx,
  userId: Id<"users">,
  templateId: Id<"workoutTemplates">,
) {
  const template = await ctx.db.get(templateId);
  if (!template || template.userId !== userId)
    throw new Error("Template not found");

  const exercises = await ctx.db
    .query("templateExercises")
    .withIndex("by_template", (q) => q.eq("templateId", templateId))
    .collect();
  await Promise.all(exercises.map((e) => ctx.db.delete(e._id)));
  await ctx.db.delete(templateId);
}

export async function listTemplates(ctx: QueryCtx, userId: Id<"users">) {
  const templates = await ctx.db
    .query("workoutTemplates")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const completedSessions = await ctx.db
    .query("workoutSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "completed"),
    )
    .collect();

  const result = await Promise.all(
    templates.map(async (t) => {
      const exercises = await ctx.db
        .query("templateExercises")
        .withIndex("by_template", (q) => q.eq("templateId", t._id))
        .collect();
      exercises.sort((a, b) => a.orderIndex - b.orderIndex);

      const times = completedSessions
        .filter((s) => s.templateId === t._id)
        .map((s) => s.completedAt ?? s.startedAt);
      const lastSessionAt = times.length ? Math.max(...times) : null;

      return {
        _id: t._id,
        name: t.name,
        updatedAt: t.updatedAt,
        lastSessionAt,
        exercises: exercises.map((e) => ({
          slug: e.exerciseSlug,
          setCount: e.sets.length,
        })),
      };
    }),
  );

  result.sort((a, b) => b.updatedAt - a.updatedAt);
  return result;
}

export async function getTemplate(
  ctx: QueryCtx,
  userId: Id<"users">,
  templateId: Id<"workoutTemplates">,
) {
  const template = await ctx.db.get(templateId);
  if (!template || template.userId !== userId) return null;

  const exercises = await ctx.db
    .query("templateExercises")
    .withIndex("by_template", (q) => q.eq("templateId", templateId))
    .collect();
  exercises.sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    _id: template._id,
    name: template.name,
    exercises: exercises.map((e) => ({
      slug: e.exerciseSlug,
      sets: e.sets,
    })),
  };
}
