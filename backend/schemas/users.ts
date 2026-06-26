import { defineTable } from "convex/server";
import { v } from "convex/values";

export const unitValidator = v.union(v.literal("lb"), v.literal("kg"));

export const userTables = {
  users: defineTable({
    workosId: v.string(),
    email: v.string(),
    // Preferred weight unit. New users default to "lb" (V1 locked decision).
    unit: unitValidator,
    createdAt: v.number(),
  }).index("by_workosId", ["workosId"]),
};
