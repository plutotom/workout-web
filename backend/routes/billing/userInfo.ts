import { v } from "convex/values";

import { query } from "../../_generated/server";

/** Authed user id + email for Polar checkout (kept separate to avoid circular types). */
export const get = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", identity.subject))
      .unique();
    if (!user) return null;
    return { _id: user._id, email: user.email };
  },
});
