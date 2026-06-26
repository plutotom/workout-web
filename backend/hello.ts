import { query } from "./_generated/server";

export const getMessage = query({
  args: {},
  handler: async () => {
    return "Hello, world.";
  },
});
