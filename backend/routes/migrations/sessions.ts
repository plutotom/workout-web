import { v } from "convex/values";

import { internalMutation } from "../../_generated/server";

/** Remove legacy `templateName` from session docs (name is resolved via templateId). */
export const stripTemplateName = internalMutation({
  args: {},
  returns: v.object({ stripped: v.number() }),
  handler: async (ctx) => {
    const sessions = await ctx.db.query("workoutSessions").collect();
    let stripped = 0;

    for (const session of sessions) {
      if (!("templateName" in session)) continue;

      await ctx.db.replace("workoutSessions", session._id, {
        userId: session.userId,
        templateId: session.templateId,
        status: session.status,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
      });
      stripped++;
    }

    return { stripped };
  },
});
