import { defineTable } from "convex/server";
import { v } from "convex/values";

export const unitValidator = v.union(v.literal("lb"), v.literal("kg"));

export const userTables = {
  users: defineTable({
    workosId: v.string(),
    email: v.string(),
    // Preferred weight unit. New users default to "lb" (V1 locked decision).
    unit: unitValidator,
    // Default bar weight per unit for the plate calculator; falls back to the
    // standard bar (45 lb / 20 kg) when unset.
    barWeightLb: v.optional(v.number()),
    barWeightKg: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workosId", ["workosId"]),
};
