import type { Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  portableBundleValidator,
} from "../schemas/portable";

type PortableBundle = Infer<typeof portableBundleValidator>;

/**
 * Snapshot the session's completed sets into the social-post bundle shape.
 * Empty workouts still produce a bundle so an existing post cannot go stale.
 */
export async function buildSessionShareBundle(
  ctx: MutationCtx,
  user: Pick<Doc<"users">, "_id" | "unit">,
  session: Doc<"workoutSessions">,
): Promise<PortableBundle> {
  const rows = await ctx.db
    .query("sessionExercises")
    .withIndex("by_session", (q) => q.eq("sessionId", session._id))
    .take(51);
  const exercises = await Promise.all(
    rows
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .slice(0, 50)
      .map(async (row) => {
        const sets = await ctx.db
          .query("sets")
          .withIndex("by_session_exercise", (q) =>
            q.eq("sessionExerciseId", row._id),
          )
          .take(101);
        const customId = row.exerciseSlug.startsWith("custom:")
          ? ctx.db.normalizeId("customExercises", row.exerciseSlug.slice(7))
          : null;
        const custom = customId ? await ctx.db.get(customId) : null;
        return {
          slug: row.exerciseSlug,
          name: custom?.name ?? row.exerciseSlug.replaceAll("-", " "),
          sets: sets
            .filter((s) => s.completed)
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .slice(0, 100)
            .map((s) => ({ weight: s.weight, reps: s.reps })),
          custom: custom && custom.userId === user._id ? custom : null,
        };
      }),
  );
  const customs = exercises.flatMap((exercise) =>
    exercise.custom
      ? [
          {
            slug: exercise.slug,
            name: exercise.custom.name,
            short: exercise.custom.short,
            category: exercise.custom.category,
            usesBar: exercise.custom.usesBar,
          },
        ]
      : [],
  );
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    exportedAt: Date.now(),
    unit: user.unit,
    templates: [
      {
        name: session.templateName || "Workout",
        exercises: exercises.map((exercise) => ({
          slug: exercise.slug,
          name: exercise.name,
          sets: exercise.sets,
        })),
      },
    ],
    customExercises: customs,
  };
}

/**
 * Keep an existing feed post in sync with the session. Caption, likes,
 * comments, and the original `completedAt` stay put so we never double-post.
 */
export async function refreshActivityPostForSession(
  ctx: MutationCtx,
  userId: Id<"users">,
  sessionId: Id<"workoutSessions">,
) {
  const post = await ctx.db
    .query("activityPosts")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique();
  if (!post || post.userId !== userId) return;
  const [session, user] = await Promise.all([
    ctx.db.get(sessionId),
    ctx.db.get(userId),
  ]);
  if (!session || !user || session.userId !== userId) return;
  const bundle = await buildSessionShareBundle(ctx, user, session);
  await ctx.db.patch(post._id, { bundle });
}
