import { defineTable } from "convex/server";
import { v } from "convex/values";

export const securityTables = {
  rateLimits: defineTable({
    key: v.string(),
    minuteBucket: v.number(),
    minuteCount: v.number(),
    dayBucket: v.number(),
    dayCount: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
};
