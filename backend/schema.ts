import { defineSchema } from "convex/server";

import { mcpTables } from "./schemas/mcp";
import { userTables } from "./schemas/users";
import { templateTables } from "./schemas/templates";
import { workoutTables } from "./schemas/workouts";

export default defineSchema({
  ...userTables,
  ...templateTables,
  ...workoutTables,
  ...mcpTables,
});
