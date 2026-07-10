/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as hello from "../hello.js";
import type * as lib_apiKeys from "../lib/apiKeys.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_exercise_notes from "../lib/exercise_notes.js";
import type * as lib_exercises from "../lib/exercises.js";
import type * as lib_insights from "../lib/insights.js";
import type * as lib_templates from "../lib/templates.js";
import type * as lib_workouts from "../lib/workouts.js";
import type * as routes_auth_users from "../routes/auth/users.js";
import type * as routes_exercises_mutations from "../routes/exercises/mutations.js";
import type * as routes_exercises_queries from "../routes/exercises/queries.js";
import type * as routes_insights_queries from "../routes/insights/queries.js";
import type * as routes_mcp_keys from "../routes/mcp/keys.js";
import type * as routes_mcp_mutations from "../routes/mcp/mutations.js";
import type * as routes_mcp_queries from "../routes/mcp/queries.js";
import type * as routes_migrations_sessions from "../routes/migrations/sessions.js";
import type * as routes_templates_mutations from "../routes/templates/mutations.js";
import type * as routes_templates_queries from "../routes/templates/queries.js";
import type * as routes_workouts_mutations from "../routes/workouts/mutations.js";
import type * as routes_workouts_queries from "../routes/workouts/queries.js";
import type * as schemas_exercises from "../schemas/exercises.js";
import type * as schemas_mcp from "../schemas/mcp.js";
import type * as schemas_templates from "../schemas/templates.js";
import type * as schemas_users from "../schemas/users.js";
import type * as schemas_workouts from "../schemas/workouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  hello: typeof hello;
  "lib/apiKeys": typeof lib_apiKeys;
  "lib/auth": typeof lib_auth;
  "lib/exercise_notes": typeof lib_exercise_notes;
  "lib/exercises": typeof lib_exercises;
  "lib/insights": typeof lib_insights;
  "lib/templates": typeof lib_templates;
  "lib/workouts": typeof lib_workouts;
  "routes/auth/users": typeof routes_auth_users;
  "routes/exercises/mutations": typeof routes_exercises_mutations;
  "routes/exercises/queries": typeof routes_exercises_queries;
  "routes/insights/queries": typeof routes_insights_queries;
  "routes/mcp/keys": typeof routes_mcp_keys;
  "routes/mcp/mutations": typeof routes_mcp_mutations;
  "routes/mcp/queries": typeof routes_mcp_queries;
  "routes/migrations/sessions": typeof routes_migrations_sessions;
  "routes/templates/mutations": typeof routes_templates_mutations;
  "routes/templates/queries": typeof routes_templates_queries;
  "routes/workouts/mutations": typeof routes_workouts_mutations;
  "routes/workouts/queries": typeof routes_workouts_queries;
  "schemas/exercises": typeof schemas_exercises;
  "schemas/mcp": typeof schemas_mcp;
  "schemas/templates": typeof schemas_templates;
  "schemas/users": typeof schemas_users;
  "schemas/workouts": typeof schemas_workouts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
