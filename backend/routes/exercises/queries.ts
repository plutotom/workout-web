import { query } from "../../_generated/server";
import { getUser } from "../../lib/auth";
import { listCustomExercises } from "../../lib/exercises";

/** The signed-in user's custom exercises (includes archived for name resolution). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return [];
    return listCustomExercises(ctx, user._id);
  },
});
