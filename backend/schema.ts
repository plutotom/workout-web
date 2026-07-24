import { defineSchema } from "convex/server";

import { exerciseTables } from "./schemas/exercises";
import { mcpTables } from "./schemas/mcp";
import { securityTables } from "./schemas/security";
import { userTables } from "./schemas/users";
import { templateTables } from "./schemas/templates";
import { workoutTables } from "./schemas/workouts";

export default defineSchema({
  ...userTables,
  ...exerciseTables,
  ...templateTables,
  ...workoutTables,
  ...mcpTables,
  ...securityTables,
});
