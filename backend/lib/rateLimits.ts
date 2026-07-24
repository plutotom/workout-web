import type { MutationCtx } from "../_generated/server";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export type RateLimitPolicy = {
  minuteLimit: number;
  dayLimit: number;
  errorCode: string;
};

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

  if (minuteCount >= policy.minuteLimit || dayCount >= policy.dayLimit) {
    throw new Error(policy.errorCode);
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
