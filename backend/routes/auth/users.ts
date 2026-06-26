import { v } from "convex/values";

import { mutation, query } from "../../_generated/server";
import { unitValidator } from "../../schemas/users";

/** The signed-in user's profile, or null if not signed in / not yet created. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", identity.subject))
      .unique();
  },
});

/**
 * Idempotently bootstrap the signed-in user's row. Called on app load.
 * Email is taken from the JWT when present, otherwise from the client (which
 * always has it from AuthKit).
 */
export const getOrCreate = mutation({
  args: { email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", identity.subject))
      .unique();
    if (existing) return existing._id;

    return await ctx.db.insert("users", {
      workosId: identity.subject,
      email: identity.email ?? args.email ?? "",
      unit: "lb",
      createdAt: Date.now(),
    });
  },
});

/** Update the user's preferred weight unit. */
export const setUnit = mutation({
  args: { unit: unitValidator },
  handler: async (ctx, { unit }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, { unit });
  },
});

/** Set the default bar weight for a unit (used by the plate calculator). */
export const setBar = mutation({
  args: { unit: unitValidator, barWeight: v.number() },
  handler: async (ctx, { unit, barWeight }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const value = Math.max(0, Math.round(barWeight));
    await ctx.db.patch(
      user._id,
      unit === "lb" ? { barWeightLb: value } : { barWeightKg: value },
    );
  },
});
