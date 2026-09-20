import { defineTable } from "convex/server";
import { v } from "convex/values";
import { portableBundleValidator } from "./portable";

export const socialTables = {
  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
  })
    .index("by_follower_following", ["followerId", "followingId"])
    .index("by_following", ["followingId"]),
  activityPosts: defineTable({
    userId: v.id("users"),
    sessionId: v.id("workoutSessions"),
    caption: v.string(),
    bundle: portableBundleValidator,
    completedAt: v.number(),
    durationSeconds: v.number(),
    likeCount: v.number(),
    commentCount: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_session", ["sessionId"]),
  activityLikes: defineTable({
    postId: v.id("activityPosts"),
    userId: v.id("users"),
  }).index("by_post_user", ["postId", "userId"]),
  activityComments: defineTable({
    postId: v.id("activityPosts"),
    userId: v.id("users"),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_post", ["postId"]),
  socialNotifications: defineTable({
    recipientId: v.id("users"),
    actorId: v.id("users"),
    kind: v.union(v.literal("follow"), v.literal("like"), v.literal("comment")),
    postId: v.optional(v.id("activityPosts")),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  }).index("by_recipient", ["recipientId"]),
};
