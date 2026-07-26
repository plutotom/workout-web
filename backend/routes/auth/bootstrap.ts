import { v } from "convex/values";

import { internalMutation, internalQuery } from "../../_generated/server";

/**
 * Avoid repeated WorkOS API calls when bootstrap remounts within a short
 * window. The cutoff is computed by the action so this query stays reactive
 * and deterministic.
 */
export const getFreshVerifiedUser = internalQuery({
  args: {
    workosId: v.string(),
    verifiedAfter: v.number(),
  },
  returns: v.union(v.null(), v.id("users")),
  handler: async (ctx, { workosId, verifiedAfter }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", workosId))
      .unique();
    if (
      !user ||
      user.emailVerifiedAt === undefined ||
      user.emailVerifiedAt < verifiedAfter
    ) {
      return null;
    }
    return user._id;
  },
});

/** Persist only an email that the authenticated bootstrap action verified. */
export const upsertVerifiedUser = internalMutation({
  args: {
    workosId: v.string(),
    email: v.string(),
    verifiedAt: v.number(),
  },
  returns: v.id("users"),
  handler: async (ctx, { workosId, email, verifiedAt }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", workosId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email,
        emailVerifiedAt: verifiedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      workosId,
      email,
      emailVerifiedAt: verifiedAt,
      unit: "lb",
      createdAt: verifiedAt,
    });
  },
});
