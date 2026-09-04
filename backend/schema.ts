import { defineSchema } from "convex/server";

import { exerciseTables } from "./schemas/exercises";
import { iosSyncTables } from "./schemas/iosSync";
import { mcpTables } from "./schemas/mcp";
import { placeTables } from "./schemas/places";
import { shareTables } from "./schemas/portable";
import { securityTables } from "./schemas/security";
import { userTables } from "./schemas/users";
import { templateTables } from "./schemas/templates";
import { workoutTables } from "./schemas/workouts";

export default defineSchema({
  ...userTables,
  ...exerciseTables,
  ...placeTables,
  ...templateTables,
  ...workoutTables,
  ...iosSyncTables,
  ...shareTables,
  ...mcpTables,
  ...securityTables,
});
