import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import { exerciseSlugValidator } from "../../schemas/exercises";

const exerciseInput = v.object({
  slug: exerciseSlugValidator,
  sets: v.array(v.object({ weight: v.number(), reps: v.number() })),
});

const clampWhole = (n: number) => Math.max(0, Math.round(n));

// Normalize per-set presets; always keep at least one row.
function normalizeSets(sets: { weight: number; reps: number }[]) {
  const cleaned = sets
    .slice(0, 20)
    .map((s) => ({ weight: clampWhole(s.weight), reps: clampWhole(s.reps) }));
  return cleaned.length ? cleaned : [{ weight: 0, reps: 0 }];
}

export const create = mutation({
  args: { name: v.string(), exercises: v.array(exerciseInput) },
  handler: async (ctx, { name, exercises }) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    const templateId = await ctx.db.insert("workoutTemplates", {
      userId: user._id,
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
          sets: normalizeSets(e.sets),
        }),
      ),
    );
    return templateId;
  },
});

export const update = mutation({
  args: {
    templateId: v.id("workoutTemplates"),
    name: v.string(),
    exercises: v.array(exerciseInput),
  },
  handler: async (ctx, { templateId, name, exercises }) => {
    const user = await requireUser(ctx);
    const template = await ctx.db.get(templateId);
    if (!template || template.userId !== user._id)
      throw new Error("Template not found");

    await ctx.db.patch(templateId, {
      name: name.trim() || "Untitled",
      updatedAt: Date.now(),
    });

    // Replace the exercise rows wholesale — simplest correct update for a small
    // ordered list.
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
          sets: normalizeSets(e.sets),
        }),
      ),
    );
  },
});

export const remove = mutation({
  args: { templateId: v.id("workoutTemplates") },
  handler: async (ctx, { templateId }) => {
    const user = await requireUser(ctx);
    const template = await ctx.db.get(templateId);
    if (!template || template.userId !== user._id)
      throw new Error("Template not found");

    const exercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("templateId", templateId))
      .collect();
    await Promise.all(exercises.map((e) => ctx.db.delete(e._id)));
    await ctx.db.delete(templateId);
  },
});

/**
 * Update a template's per-set presets to match a finished session, using **all**
 * logged set rows (checkmarks are just a progress aid, not a gate). Matches
 * exercises by slug; an exercise no longer on the template is skipped.
 */
export const syncFromSession = mutation({
  args: { sessionId: v.id("workoutSessions") },
  handler: async (ctx, { sessionId }) => {
    const user = await requireUser(ctx);

    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== user._id)
      throw new Error("Session not found");

    const template = await ctx.db.get(session.templateId);
    if (!template || template.userId !== user._id)
      throw new Error("Template not found");

    const templateExercises = await ctx.db
      .query("templateExercises")
      .withIndex("by_template", (q) => q.eq("templateId", template._id))
      .collect();
    const bySlug = new Map(
      templateExercises.map((te) => [te.exerciseSlug, te]),
    );

    const sessionExercises = await ctx.db
      .query("sessionExercises")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    let changed = false;
    for (const se of sessionExercises) {
      const target = bySlug.get(se.exerciseSlug);
      if (!target) continue;

      const sets = await ctx.db
        .query("sets")
        .withIndex("by_session_exercise", (q) =>
          q.eq("sessionExerciseId", se._id),
        )
        .collect();
      const logged = sets
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((s) => ({ weight: s.weight, reps: s.reps }));
      if (logged.length === 0) continue;

      await ctx.db.patch(target._id, { sets: logged });
      changed = true;
    }

    if (changed) await ctx.db.patch(template._id, { updatedAt: Date.now() });
  },
});
