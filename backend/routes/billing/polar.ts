import { Polar } from "@convex-dev/polar";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { components } from "../../_generated/api";
import type { DataModel, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { action, internalAction } from "../../_generated/server";

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

function configuredBillingOrigins(): Set<string> {
  const configured = process.env.BILLING_ALLOWED_ORIGINS;
  const defaults = ["https://workout.plutotom.com", "http://localhost:4271"];
  return new Set(
    (configured?.split(",") ?? defaults)
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function requireAllowedOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid billing origin");
  }
  if (
    url.origin !== raw ||
    url.username ||
    url.password ||
    !configuredBillingOrigins().has(url.origin)
  ) {
    throw new Error("Billing origin is not allowed");
  }
  return url.origin;
}

function requireAllowedReturnUrl(raw: string): string {
  if (raw.length > 2_048) throw new Error("Billing return URL is too long");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid billing return URL");
  }
  if (
    url.username ||
    url.password ||
    !configuredBillingOrigins().has(url.origin)
  ) {
    throw new Error("Billing return URL is not allowed");
  }
  return url.toString();
}

const getBillingUser = makeFunctionReference<"query">(
  "routes/billing/userInfo:get",
);

const setPlanFromPolarRef = makeFunctionReference<"mutation">(
  "routes/billing/syncPlan:setPlanFromPolar",
);
const consumeRateLimitRef = makeFunctionReference<"mutation">(
  "routes/security/rateLimits:consume",
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

const generatedPolarApi = polar.api();

/** Public product descriptions/prices; no privileged operation occurs. */
export const getConfiguredProducts = generatedPolarApi.getConfiguredProducts;

async function requireBillingUser(ctx: ActionCtx) {
  const user = (await ctx.runQuery(getBillingUser, {})) as BillingUser;
  if (!user) throw new Error("Not authenticated");
  if (!user.email) throw new Error("User email is required for billing");
  return user;
}

async function consumeBillingRateLimit(ctx: ActionCtx, userId: Id<"users">) {
  await ctx.runMutation(consumeRateLimitRef, {
    key: `billing:${userId}`,
    minuteLimit: 10,
    dayLimit: 100,
    errorCode: "BILLING_RATE_LIMITED",
  });
}

/**
 * Generate checkout using only server-configured products. Optional component
 * arguments that could alter pricing, trials, ownership metadata, or redirects
 * are rejected instead of trusted.
 */
export const generateCheckoutLink = action({
  args: {
    productIds: v.array(v.string()),
    origin: v.string(),
    successUrl: v.string(),
    subscriptionId: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    trialInterval: v.optional(v.union(v.string(), v.null())),
    trialIntervalCount: v.optional(v.union(v.number(), v.null())),
    locale: v.optional(v.string()),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireBillingUser(ctx);
    await consumeBillingRateLimit(ctx, user._id);

    const allowedProducts = new Set(
      Object.values(configuredProducts()).filter(
        (id): id is string => typeof id === "string",
      ),
    );
    const productIds = [...new Set(args.productIds)];
    if (
      productIds.length === 0 ||
      productIds.length > allowedProducts.size ||
      productIds.some((id) => !allowedProducts.has(id))
    ) {
      throw new Error("Invalid checkout products");
    }
    if (
      args.subscriptionId ||
      (args.metadata && Object.keys(args.metadata).length > 0) ||
      args.trialInterval != null ||
      args.trialIntervalCount != null
    ) {
      throw new Error("Client-controlled checkout options are not allowed");
    }

    const origin = requireAllowedOrigin(args.origin);
    const successUrl = requireAllowedReturnUrl(args.successUrl);
    if (new URL(successUrl).origin !== origin) {
      throw new Error("Checkout URLs must use the same origin");
    }

    const checkout = await polar.createCheckoutSession(ctx, {
      productIds,
      userId: user._id,
      email: user.email,
      origin,
      successUrl,
    });

    let url = checkout.url;
    if (args.locale) {
      if (!/^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/.test(args.locale)) {
        throw new Error("Invalid checkout locale");
      }
      const checkoutUrl = new URL(url);
      checkoutUrl.searchParams.set("locale", args.locale);
      url = checkoutUrl.toString();
    }
    return { url };
  },
});

export const generateCustomerPortalUrl = action({
  args: { returnUrl: v.optional(v.string()) },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, { returnUrl }) => {
    const user = await requireBillingUser(ctx);
    await consumeBillingRateLimit(ctx, user._id);
    return await polar.createCustomerPortalSession(ctx, {
      userId: user._id,
      returnUrl: returnUrl ? requireAllowedReturnUrl(returnUrl) : undefined,
    });
  },
});

/** Sync products from Polar into the component tables (run after setup). */
export const syncProducts = internalAction({
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
