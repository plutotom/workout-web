import { Polar } from "@convex-dev/polar";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { components } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";
import { action } from "../../_generated/server";

function configuredProducts() {
  const proMonthly = process.env.POLAR_PRODUCT_PRO_MONTHLY?.trim();
  const proYearly = process.env.POLAR_PRODUCT_PRO_YEARLY?.trim();
  return {
    ...(proMonthly ? { proMonthly } : {}),
    ...(proYearly ? { proYearly } : {}),
  } as {
    proMonthly?: string;
    proYearly?: string;
  };
}

export function isBillingConfigured() {
  const products = configuredProducts();
  return Boolean(products.proMonthly || products.proYearly);
}

const getBillingUser = makeFunctionReference<"query">(
  "routes/billing/userInfo:get",
);

const setPlanFromPolarRef = makeFunctionReference<"mutation">(
  "routes/billing/syncPlan:setPlanFromPolar",
);

type BillingUser = { _id: Id<"users">; email: string } | null;

export const polar = new Polar<
  DataModel,
  ReturnType<typeof configuredProducts>
>(components.polar, {
  getUserInfo: async (ctx) => {
    const user = (await ctx.runQuery(getBillingUser, {})) as BillingUser;
    if (!user) throw new Error("Not authenticated");
    if (!user.email) throw new Error("User email is required for billing");
    return { userId: user._id, email: user.email };
  },
  products: configuredProducts(),
});

export const {
  changeCurrentSubscription,
  cancelCurrentSubscription,
  getConfiguredProducts,
  listAllProducts,
  generateCheckoutLink,
  generateCustomerPortalUrl,
} = polar.api();

/** Sync products from Polar into the component tables (run after setup). */
export const syncProducts = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await polar.syncProducts(ctx);
    return null;
  },
});

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

function planFromSubscriptionStatus(status: string): "free" | "pro" {
  return ACTIVE_STATUSES.has(status) ? "pro" : "free";
}

function extractUserIdFromSubscription(data: {
  customer?: {
    metadata?: Record<string, unknown>;
    externalId?: string | null;
  };
}): string | null {
  const metaUserId = data.customer?.metadata?.userId;
  if (typeof metaUserId === "string" && metaUserId.length > 0) {
    return metaUserId;
  }
  if (data.customer?.externalId) return data.customer.externalId;
  return null;
}

export async function syncUserPlanFromPolarEvent(
  ctx: {
    runMutation: (
      reference: typeof setPlanFromPolarRef,
      args: { userId: Id<"users">; plan: "free" | "pro" },
    ) => Promise<unknown>;
  },
  data: {
    status: string;
    customer?: {
      metadata?: Record<string, unknown>;
      externalId?: string | null;
    };
  },
) {
  const userId = extractUserIdFromSubscription(data);
  if (!userId) {
    console.warn("Polar subscription event missing userId metadata");
    return;
  }
  const plan = planFromSubscriptionStatus(data.status);
  await ctx.runMutation(setPlanFromPolarRef, {
    userId: userId as Id<"users">,
    plan,
  });
}
