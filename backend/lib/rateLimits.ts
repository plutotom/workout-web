import { ConvexError } from "convex/values";

import type { MutationCtx } from "../_generated/server";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type RateLimitPolicy = {
  minuteLimit: number;
  dayLimit: number;
  errorCode: string;
};

export type RateLimitErrorData = {
  code: string;
  scope: "minute" | "day";
  limit: number;
  retryAfterMs: number;
};

export function isRateLimitError(
  error: unknown,
  code: string,
): error is ConvexError<RateLimitErrorData> {
  if (!(error instanceof ConvexError)) return false;
  const data = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    (data as { code: unknown }).code === code
  );
}

export async function consumeRateLimit(
  ctx: MutationCtx,
  key: string,
  policy: RateLimitPolicy,
) {
  const now = Date.now();
  const minuteBucket = Math.floor(now / MINUTE_MS);
  const dayBucket = Math.floor(now / DAY_MS);

  const existing = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  const minuteCount =
    existing?.minuteBucket === minuteBucket ? existing.minuteCount : 0;
  const dayCount = existing?.dayBucket === dayBucket ? existing.dayCount : 0;

  if (minuteCount >= policy.minuteLimit) {
    throw new ConvexError({
      code: policy.errorCode,
      scope: "minute",
      limit: policy.minuteLimit,
      retryAfterMs: Math.max(1_000, (minuteBucket + 1) * MINUTE_MS - now),
    } satisfies RateLimitErrorData);
  }

  if (dayCount >= policy.dayLimit) {
    throw new ConvexError({
      code: policy.errorCode,
      scope: "day",
      limit: policy.dayLimit,
      retryAfterMs: Math.max(1_000, (dayBucket + 1) * DAY_MS - now),
    } satisfies RateLimitErrorData);
  }

  const next = {
    key,
    minuteBucket,
    minuteCount: minuteCount + 1,
    dayBucket,
    dayCount: dayCount + 1,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.replace(existing._id, next);
  } else {
    await ctx.db.insert("rateLimits", next);
  }
}
