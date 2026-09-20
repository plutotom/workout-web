import { v } from "convex/values";

import type { Doc, Id } from "../../_generated/dataModel";
import { query, type QueryCtx } from "../../_generated/server";
import { getUser } from "../../lib/auth";

export const personValidator = v.object({
  id: v.id("users"),
  name: v.string(),
  handle: v.union(v.string(), v.null()),
  bio: v.string(),
  followerCount: v.number(),
  followingCount: v.number(),
  isFollowing: v.boolean(),
  isSelf: v.boolean(),
});
export const postValidator = v.object({
  id: v.id("activityPosts"),
  userId: v.id("users"),
  name: v.string(),
  handle: v.union(v.string(), v.null()),
  title: v.string(),
  caption: v.string(),
  completedAt: v.number(),
  durationSeconds: v.number(),
  exerciseCount: v.number(),
  likeCount: v.number(),
  commentCount: v.number(),
  liked: v.boolean(),
  exercises: v.array(v.object({ name: v.string(), sets: v.number() })),
});
export type SocialPost = {
  id: Id<"activityPosts">;
  userId: Id<"users">;
  name: string;
  handle: string | null;
  title: string;
  caption: string;
  completedAt: number;
  durationSeconds: number;
  exerciseCount: number;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  exercises: { name: string; sets: number }[];
};
export function publicName(user: Pick<Doc<"users">, "displayName" | "handle">) {
  return user.displayName || user.handle || "Athlete";
}

async function decorate(
  ctx: QueryCtx,
  posts: Doc<"activityPosts">[],
  viewerId: Id<"users">,
): Promise<SocialPost[]> {
  const results = await Promise.all(
    posts.map(async (post) => {
      const [author, ownLike] = await Promise.all([
        ctx.db.get(post.userId),
        ctx.db
          .query("activityLikes")
          .withIndex("by_post_user", (q) =>
            q.eq("postId", post._id).eq("userId", viewerId),
          )
          .unique(),
      ]);
      if (!author) return null;
      const workout = post.bundle.templates[0];
      return {
        id: post._id,
        userId: author._id,
        name: publicName(author),
        handle: author.handle ?? null,
        title: workout.name,
        caption: post.caption,
        completedAt: post.completedAt,
        durationSeconds: post.durationSeconds,
        exerciseCount: workout.exercises.length,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        liked: !!ownLike,
        exercises: workout.exercises.map((e) => ({
          name: e.name,
          sets: e.sets.length,
        })),
      };
    }),
  );
  return results.filter((post): post is SocialPost => post !== null);
}

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("users"),
      name: v.string(),
      handle: v.union(v.string(), v.null()),
      bio: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const user = await getUser(ctx);
    return user
      ? {
          id: user._id,
          name: publicName(user),
          handle: user.handle ?? null,
          bio: user.bio ?? "",
        }
      : null;
  },
});

export const search = query({
  args: { handle: v.string() },
  returns: v.array(
    v.object({ id: v.id("users"), name: v.string(), handle: v.string() }),
  ),
  handler: async (ctx, { handle }) => {
    const viewer = await getUser(ctx);
    if (!viewer) return [];
    const prefix = handle.trim().toLowerCase().replace(/^@/, "");
    if (!prefix) return [];
    const users = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) =>
        q.gte("handle", prefix).lt("handle", prefix + "\uffff"),
      )
      .take(20);
    return users
      .filter((u) => u._id !== viewer._id && u.handle)
      .map((u) => ({ id: u._id, name: publicName(u), handle: u.handle! }));
  },
});

export const profile = query({
  args: { userId: v.optional(v.id("users")) },
  returns: v.union(v.null(), personValidator),
  handler: async (ctx, { userId }) => {
    const viewer = await getUser(ctx);
    if (!viewer) return null;
    const person = userId ? await ctx.db.get(userId) : viewer;
    if (!person) return null;
    const [followers, following, edge] = await Promise.all([
      ctx.db
        .query("follows")
        .withIndex("by_following", (q) => q.eq("followingId", person._id))
        .take(1001),
      ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", person._id),
        )
        .take(1001),
      ctx.db
        .query("follows")
        .withIndex("by_follower_following", (q) =>
          q.eq("followerId", viewer._id).eq("followingId", person._id),
        )
        .unique(),
    ]);
    return {
      id: person._id,
      name: publicName(person),
      handle: person.handle ?? null,
      bio: person.bio ?? "",
      followerCount: followers.length,
      followingCount: following.length,
      isFollowing: !!edge,
      isSelf: viewer._id === person._id,
    };
  },
});

export const feed = query({
  args: {},
  returns: v.array(postValidator),
  handler: async (ctx) => {
    const viewer = await getUser(ctx);
    if (!viewer) return [];
    const follows = await ctx.db
      .query("follows")
      .withIndex("by_follower_following", (q) => q.eq("followerId", viewer._id))
      .take(100);
    const lists = await Promise.all(
      [viewer._id, ...follows.map((f) => f.followingId)].map((id) =>
        ctx.db
          .query("activityPosts")
          .withIndex("by_user", (q) => q.eq("userId", id))
          .order("desc")
          .take(30),
      ),
    );
    const posts = lists
      .flat()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30);
    return decorate(ctx, posts, viewer._id);
  },
});

export const profilePosts = query({
  args: { userId: v.id("users") },
  returns: v.array(postValidator),
  handler: async (ctx, { userId }) => {
    const viewer = await getUser(ctx);
    if (!viewer) return [];
    const posts = await ctx.db
      .query("activityPosts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(30);
    return decorate(ctx, posts, viewer._id);
  },
});

export const post = query({
  args: { postId: v.id("activityPosts") },
  returns: v.union(v.null(), postValidator),
  handler: async (ctx, { postId }) => {
    const viewer = await getUser(ctx);
    if (!viewer) return null;
    const row = await ctx.db.get(postId);
    if (!row) return null;
    return (await decorate(ctx, [row], viewer._id))[0] ?? null;
  },
});

export const sharedSession = query({
  args: { sessionId: v.id("workoutSessions") },
  returns: v.union(v.id("activityPosts"), v.null()),
  handler: async (ctx, { sessionId }) => {
    const viewer = await getUser(ctx);
    if (!viewer) return null;
    const session = await ctx.db.get(sessionId);
    if (session?.userId !== viewer._id) return null;
    const row = await ctx.db
      .query("activityPosts")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    return row?._id ?? null;
  },
});

/** Resolve an iOS SQLite session ID once its offline snapshot reaches Convex. */
export const syncedSession = query({
  args: { localId: v.string() },
  returns: v.union(v.null(), v.id("workoutSessions")),
  handler: async (ctx, { localId }) => {
    const viewer = await getUser(ctx);
    if (!viewer) return null;
    const remoteId = ctx.db.normalizeId("workoutSessions", localId);
    const direct = remoteId ? await ctx.db.get(remoteId) : null;
    if (direct?.userId === viewer._id && direct.status === "completed")
      return direct._id;
    const synced = await ctx.db
      .query("workoutSessions")
      .withIndex("by_user_client_id", (q) =>
        q.eq("userId", viewer._id).eq("clientId", localId),
      )
      .unique();
    return synced?.status === "completed" ? synced._id : null;
  },
});

export const comments = query({
  args: { postId: v.id("activityPosts") },
  returns: v.array(
    v.object({
      id: v.id("activityComments"),
      userId: v.id("users"),
      name: v.string(),
      text: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { postId }) => {
    if (!(await getUser(ctx)) || !(await ctx.db.get(postId))) return [];
    const rows = await ctx.db
      .query("activityComments")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .order("asc")
      .take(100);
    return Promise.all(
      rows.map(async (row) => {
        const author = await ctx.db.get(row.userId);
        return {
          id: row._id,
          userId: row.userId,
          name: author ? publicName(author) : "Athlete",
          text: row.text,
          createdAt: row.createdAt,
        };
      }),
    );
  },
});

export const notifications = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("socialNotifications"),
      actorId: v.id("users"),
      name: v.string(),
      kind: v.union(
        v.literal("follow"),
        v.literal("like"),
        v.literal("comment"),
      ),
      postId: v.union(v.null(), v.id("activityPosts")),
      createdAt: v.number(),
      read: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const viewer = await getUser(ctx);
    if (!viewer) return [];
    const rows = await ctx.db
      .query("socialNotifications")
      .withIndex("by_recipient", (q) => q.eq("recipientId", viewer._id))
      .order("desc")
      .take(50);
    return Promise.all(
      rows.map(async (row) => {
        const actor = await ctx.db.get(row.actorId);
        return {
          id: row._id,
          actorId: row.actorId,
          name: actor ? publicName(actor) : "Athlete",
          kind: row.kind,
          postId: row.postId ?? null,
          createdAt: row.createdAt,
          read: !!row.readAt,
        };
      }),
    );
  },
});
