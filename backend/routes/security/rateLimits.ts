import { v } from "convex/values";

import { internalMutation } from "../../_generated/server";
import { consumeRateLimit } from "../../lib/rateLimits";

/** Internal bridge for actions, which cannot write rate-limit state directly. */
export const consume = internalMutation({
  args: {
    key: v.string(),
    minuteLimit: v.number(),
    dayLimit: v.number(),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await consumeRateLimit(ctx, args.key, args);
    return null;
  },
});
