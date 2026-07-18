import { defineTable } from "convex/server";
import { v } from "convex/values";

export const unitValidator = v.union(v.literal("lb"), v.literal("kg"));

export const activeWorkoutModeValidator = v.union(
  v.literal("list"),
  v.literal("focus"),
);

/** Account tier. Missing / "free" = free; "pro" unlocks AI features. */
export const planValidator = v.union(v.literal("free"), v.literal("pro"));

export const userTables = {
  users: defineTable({
    workosId: v.string(),
    email: v.string(),
    // Billing tier. Missing means free until payments land.
    plan: v.optional(planValidator),
    // Preferred weight unit. New users default to "lb" (V1 locked decision).
    unit: unitValidator,
    // Default bar weight per unit for the plate calculator; falls back to the
    // standard bar (45 lb / 20 kg) when unset.
    barWeightLb: v.optional(v.number()),
    barWeightKg: v.optional(v.number()),
    // Which active-workout view opens for in-progress sessions. Missing means
    // "list" (the original whole-session log).
    activeWorkoutMode: v.optional(activeWorkoutModeValidator),
    // Whether logging a set starts the rest timer (List bar / Focus ring).
    // Missing means enabled. The workout elapsed clock is unaffected.
    restTimerEnabled: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_workosId", ["workosId"]),
};
