import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import { importBundle } from "../../lib/portableTemplates";

export const saveProfile = mutation({
  args: { handle: v.string(), name: v.string(), bio: v.string() },
  returns: v.null(),
  handler: async (ctx, { handle, name, bio }) => {
    const user = await requireUser(ctx);
    const normalized = handle.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_]{3,24}$/.test(normalized))
      throw new Error(
        "Username must have 3–24 letters, digits, or underscores",
      );
    if (!name.trim() || name.trim().length > 60 || bio.length > 300)
      throw new Error("Invalid profile details");
    const taken = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", normalized))
      .unique();
    if (taken && taken._id !== user._id)
      throw new Error("That username is taken");
    await ctx.db.patch(user._id, {
      handle: normalized,
      displayName: name.trim(),
      bio: bio.trim(),
    });
    return null;
  },
});

export const toggleFollow = mutation({
  args: { userId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => {
    const viewer = await requireUser(ctx);
    if (userId === viewer._id || !(await ctx.db.get(userId)))
      throw new Error("Profile unavailable");
    const edge = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) =>
        q.eq("followerId", viewer._id).eq("followingId", userId),
      )
      .unique();
    if (edge) {
      await ctx.db.delete(edge._id);
      return false;
    }
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) => q.eq("followerId", viewer._id))
      .take(100);
    if (existing.length === 100)
      throw new Error("You can follow up to 100 athletes");
    await ctx.db.insert("follows", {
      followerId: viewer._id,
      followingId: userId,
    });
    await ctx.db.insert("socialNotifications", {
      recipientId: userId,
      actorId: viewer._id,
      kind: "follow",
      createdAt: Date.now(),
    });
    return true;
  },
});

export const shareWorkout = mutation({
  args: { sessionId: v.id("workoutSessions"), caption: v.string() },
  returns: v.id("activityPosts"),
  handler: async (ctx, { sessionId, caption }) => {
    const user = await requireUser(ctx);
    const session = await ctx.db.get(sessionId);
    if (
      !session ||
      session.userId !== user._id ||
      session.status !== "completed" ||
      session.sessionKind === "health_summary"
    )
      throw new Error(
        "Only your synced, completed strength workouts can be shared",
      );
    if (caption.length > 500) throw new Error("Caption is too long");
    const existing = await ctx.db
      .query("activityPosts")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (existing) return existing._id;
    const rows = await ctx.db
      .query("sessionExercises")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .take(51);
    if (!rows.length || rows.length > 50)
      throw new Error("Workout must have 1–50 exercises to share");
    const exercises = await Promise.all(
      rows
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(async (row) => {
          const sets = await ctx.db
            .query("sets")
            .withIndex("by_session_exercise", (q) =>
              q.eq("sessionExerciseId", row._id),
            )
            .take(101);
          if (sets.length > 100) throw new Error("Too many sets to share");
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
              .map((s) => ({ weight: s.weight, reps: s.reps })),
            custom: custom && custom.userId === user._id ? custom : null,
          };
        }),
    );
    const customs = exercises.flatMap((e) =>
      e.custom
        ? [
            {
              slug: e.slug,
              name: e.custom.name,
              short: e.custom.short,
              category: e.custom.category,
              usesBar: e.custom.usesBar,
            },
          ]
        : [],
    );
    const completedAt = session.completedAt ?? session.startedAt;
    const bundle = {
      format: "workout.export" as const,
      version: 1 as const,
      exportedAt: Date.now(),
      unit: user.unit,
      templates: [
        {
          name: session.templateName || "Workout",
          exercises: exercises.map((e) => ({
            slug: e.slug,
            name: e.name,
            sets: e.sets,
          })),
        },
      ],
      customExercises: customs,
    };
    return ctx.db.insert("activityPosts", {
      userId: user._id,
      sessionId,
      caption: caption.trim(),
      bundle,
      completedAt,
      durationSeconds:
        session.durationSeconds ??
        Math.max(0, Math.round((completedAt - session.startedAt) / 1000)),
      likeCount: 0,
      commentCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const removePost = mutation({
  args: { postId: v.id("activityPosts") },
  returns: v.null(),
  handler: async (ctx, { postId }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post || post.userId !== user._id) throw new Error("Post unavailable");
    const likes = await ctx.db
      .query("activityLikes")
      .withIndex("by_post_user", (q) => q.eq("postId", postId))
      .take(1001);
    const comments = await ctx.db
      .query("activityComments")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .take(1001);
    if (likes.length > 1000 || comments.length > 1000)
      throw new Error("Post has too many interactions to remove right now");
    for (const row of [...likes, ...comments]) await ctx.db.delete(row._id);
    await ctx.db.delete(postId);
    return null;
  },
});

export const copyWorkout = mutation({
  args: { postId: v.id("activityPosts") },
  returns: v.id("workoutTemplates"),
  handler: async (ctx, { postId }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Workout unavailable");
    const result = await importBundle(ctx, user._id, post.bundle, {
      includeNotes: false,
    });
    return result.templateIds[0];
  },
});

export const toggleLike = mutation({
  args: { postId: v.id("activityPosts") },
  returns: v.boolean(),
  handler: async (ctx, { postId }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post unavailable");
    const edge = await ctx.db
      .query("activityLikes")
      .withIndex("by_post_user", (q) =>
        q.eq("postId", postId).eq("userId", user._id),
      )
      .unique();
    if (edge) {
      await ctx.db.delete(edge._id);
      await ctx.db.patch(postId, {
        likeCount: Math.max(0, post.likeCount - 1),
      });
      return false;
    }
    if (post.likeCount >= 1000) throw new Error("Like limit reached");
    await ctx.db.insert("activityLikes", { postId, userId: user._id });
    await ctx.db.patch(postId, { likeCount: post.likeCount + 1 });
    if (post.userId !== user._id)
      await ctx.db.insert("socialNotifications", {
        recipientId: post.userId,
        actorId: user._id,
        kind: "like",
        postId,
        createdAt: Date.now(),
      });
    return true;
  },
});

export const addComment = mutation({
  args: { postId: v.id("activityPosts"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { postId, text }) => {
    const user = await requireUser(ctx);
    const post = await ctx.db.get(postId);
    if (!post || !text.trim() || text.trim().length > 500)
      throw new Error("Write a comment under 500 characters");
    if (post.commentCount >= 1000) throw new Error("Comment limit reached");
    await ctx.db.insert("activityComments", {
      postId,
      userId: user._id,
      text: text.trim(),
      createdAt: Date.now(),
    });
    await ctx.db.patch(postId, { commentCount: post.commentCount + 1 });
    if (post.userId !== user._id)
      await ctx.db.insert("socialNotifications", {
        recipientId: post.userId,
        actorId: user._id,
        kind: "comment",
        postId,
        createdAt: Date.now(),
      });
    return null;
  },
});

export const removeComment = mutation({
  args: { commentId: v.id("activityComments") },
  returns: v.null(),
  handler: async (ctx, { commentId }) => {
    const user = await requireUser(ctx);
    const comment = await ctx.db.get(commentId);
    if (!comment) throw new Error("Comment unavailable");
    const post = await ctx.db.get(comment.postId);
    if (comment.userId !== user._id && post?.userId !== user._id)
      throw new Error("Cannot remove this comment");
    await ctx.db.delete(commentId);
    if (post)
      await ctx.db.patch(post._id, {
        commentCount: Math.max(0, post.commentCount - 1),
      });
    return null;
  },
});

export const markNotificationsRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("socialNotifications")
      .withIndex("by_recipient", (q) => q.eq("recipientId", user._id))
      .order("desc")
      .take(50);
    for (const row of rows)
      if (!row.readAt) await ctx.db.patch(row._id, { readAt: Date.now() });
    return null;
  },
});
