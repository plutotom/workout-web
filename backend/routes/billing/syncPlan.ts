import { v } from "convex/values";

import { internalMutation } from "../../_generated/server";
import { planValidator } from "../../schemas/users";

/** Denormalize Polar subscription status onto users.plan. */
export const setPlanFromPolar = internalMutation({
  args: {
    userId: v.id("users"),
    plan: planValidator,
  },
  returns: v.null(),
  handler: async (ctx, { userId, plan }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    if (user.plan === plan) return null;
    await ctx.db.patch(userId, { plan });
    return null;
  },
});
