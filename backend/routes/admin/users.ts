import { v } from "convex/values";

import { mutation, query } from "../../_generated/server";
import { requireAdmin } from "../../lib/admin";
import { planValidator, roleValidator } from "../../schemas/users";

const LIST_LIMIT = 200;

const adminUserReturn = v.object({
  _id: v.id("users"),
  email: v.string(),
  plan: v.union(planValidator, v.literal("free")),
  role: v.union(roleValidator, v.literal("user")),
  createdAt: v.number(),
});

/** List users for the admin Pro grant UI (bounded). */
export const listUsers = query({
  args: {},
  returns: v.array(adminUserReturn),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const users = await ctx.db.query("users").take(LIST_LIMIT);
    return users
      .map((user) => ({
        _id: user._id,
        email: user.email,
        plan: (user.plan ?? "free") as "free" | "pro",
        role: (user.role ?? "user") as "user" | "admin",
        createdAt: user.createdAt,
      }))
      .sort((a, b) => a.email.localeCompare(b.email));
  },
});

/** Grant or revoke Pro by setting `plan` (admin only). */
export const setUserPlan = mutation({
  args: {
    userId: v.id("users"),
    plan: planValidator,
  },
  returns: v.null(),
  handler: async (ctx, { userId, plan }) => {
    await requireAdmin(ctx);

    const target = await ctx.db.get(userId);
    if (!target) {
      throw new Error("User not found");
    }

    await ctx.db.patch(userId, { plan });
    return null;
  },
});
