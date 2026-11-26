import { defineSchema } from "convex/server";

import { exerciseTables } from "./schemas/exercises";
import { iosSyncTables } from "./schemas/iosSync";
import { mcpTables } from "./schemas/mcp";
import { nativeSyncTables } from "./schemas/nativeSync";
import { placeTables } from "./schemas/places";
import { shareTables } from "./schemas/portable";
import { securityTables } from "./schemas/security";
import { userTables } from "./schemas/users";
import { templateTables } from "./schemas/templates";
import { workoutTables } from "./schemas/workouts";
import { socialTables } from "./schemas/social";

export default defineSchema({
  ...userTables,
  ...exerciseTables,
  ...placeTables,
  ...templateTables,
  ...workoutTables,
  ...iosSyncTables,
  ...nativeSyncTables,
  ...shareTables,
  ...mcpTables,
  ...securityTables,
  ...socialTables,
});
