import { v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireUser } from "../../lib/auth";
import { consumeRateLimit } from "../../lib/rateLimits";

const AI_GENERATION_POLICY = {
  minuteLimit: 5,
  dayLimit: 50,
  errorCode: "AI_RATE_LIMITED",
} as const;

/** Reserve one bounded AI generation for the authenticated user. */
export const consumeGeneration = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await consumeRateLimit(ctx, `ai:${user._id}`, AI_GENERATION_POLICY);
    return null;
  },
});
