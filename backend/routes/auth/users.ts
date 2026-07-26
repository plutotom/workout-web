import { v } from "convex/values";

import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { action, mutation, query } from "../../_generated/server";
import { isAdminUser, requireAdmin } from "../../lib/admin";
import { allowManualPro, isProUser } from "../../lib/plan";
import { fetchVerifiedWorkosEmail } from "../../lib/workos";
import { isBillingConfigured, polar } from "../billing/polar";
import {
  activeWorkoutModeValidator,
  planValidator,
  unitValidator,
} from "../../schemas/users";

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
 * Entitlements for gated features (AI template generation, etc.).
 * Pro = active Polar subscription, `plan === "pro"`, or `PRO_EMAILS` allowlist.
 */
export const entitlement = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      isPro: v.boolean(),
      isAdmin: v.boolean(),
      plan: v.union(planValidator, v.literal("free")),
      allowManualPro: v.boolean(),
      billingConfigured: v.boolean(),
      subscription: v.union(
        v.null(),
        v.object({
          status: v.string(),
          productKey: v.union(v.string(), v.null()),
          productName: v.union(v.string(), v.null()),
          currentPeriodEnd: v.union(v.string(), v.null()),
          cancelAtPeriodEnd: v.boolean(),
        }),
      ),
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

    let subscription: {
      status: string;
      productKey: string | null;
      productName: string | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    } | null = null;
    let hasPaidSubscription = false;

    try {
      const currentSub = await polar.getCurrentSubscription(ctx, {
        userId: user._id,
      });
      if (currentSub) {
        hasPaidSubscription =
          currentSub.status === "active" || currentSub.status === "trialing";
        const key =
          typeof currentSub.productKey === "string"
            ? currentSub.productKey
            : null;
        subscription = {
          status: currentSub.status,
          productKey: key,
          productName: currentSub.product?.name ?? null,
          currentPeriodEnd: currentSub.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: currentSub.cancelAtPeriodEnd,
        };
      }
    } catch {
      // Polar component may not be synced yet.
    }

    const isAdmin = isAdminUser(user);
    const isPro = hasPaidSubscription || isProUser(user);

    return {
      isPro,
      isAdmin,
      plan: isPro ? ("pro" as const) : ("free" as const),
      allowManualPro: allowManualPro() && isAdmin,
      billingConfigured: isBillingConfigured(),
      subscription,
    };
  },
});

/**
 * Idempotently bootstrap the signed-in user's row. WorkOS access tokens do not
 * include an email claim, so the action resolves and verifies the address with
 * WorkOS's server API. Client-provided identity attributes are never accepted.
 */
export const getOrCreate = action({
  args: {},
  returns: v.id("users"),
  handler: async (ctx): Promise<Id<"users">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = Date.now();
    const existingId: Id<"users"> | null = await ctx.runQuery(
      internal.routes.auth.bootstrap.getFreshVerifiedUser,
      {
        workosId: identity.subject,
        verifiedAfter: now - 15 * 60 * 1_000,
      },
    );
    if (existingId) return existingId;

    const apiKey = process.env.WORKOS_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("User verification is unavailable");
    }

    const verifiedEmail = await fetchVerifiedWorkosEmail(
      identity.subject,
      apiKey,
    );

    return await ctx.runMutation(
      internal.routes.auth.bootstrap.upsertVerifiedUser,
      {
        workosId: identity.subject,
        email: verifiedEmail,
        verifiedAt: Date.now(),
      },
    );
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

/** Update which active-workout view the user prefers (list | focus). */
export const setActiveWorkoutMode = mutation({
  args: { mode: activeWorkoutModeValidator },
  handler: async (ctx, { mode }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, { activeWorkoutMode: mode });
  },
});

/** Enable or disable the post-set rest timer (List bar / Focus ring). */
export const setRestTimerEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, { restTimerEnabled: enabled });
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

/**
 * Temporary plan toggle for testing AI / Pro gates before billing exists.
 * Only available when Convex env `ALLOW_MANUAL_PRO=true`.
 */
export const setPlanForTesting = mutation({
  args: { plan: planValidator },
  returns: v.null(),
  handler: async (ctx, { plan }) => {
    if (!allowManualPro()) {
      throw new Error("Manual Pro changes are disabled");
    }
    const user = await requireAdmin(ctx);
    await ctx.db.patch(user._id, { plan });
    return null;
  },
});
