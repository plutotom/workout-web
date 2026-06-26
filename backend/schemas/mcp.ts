import { defineTable } from "convex/server";
import { v } from "convex/values";

export const mcpTables = {
  mcpApiKeys: defineTable({
    userId: v.id("users"),
    keyHash: v.string(),
    keyPrefix: v.string(),
    name: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_user", ["userId"]),
};
