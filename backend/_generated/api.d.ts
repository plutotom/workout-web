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
import type * as lib_auth from "../lib/auth.js";
import type * as routes_auth_users from "../routes/auth/users.js";
import type * as routes_templates_mutations from "../routes/templates/mutations.js";
import type * as routes_templates_queries from "../routes/templates/queries.js";
import type * as routes_workouts_mutations from "../routes/workouts/mutations.js";
import type * as routes_workouts_queries from "../routes/workouts/queries.js";
import type * as schemas_exercises from "../schemas/exercises.js";
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
  "lib/auth": typeof lib_auth;
  "routes/auth/users": typeof routes_auth_users;
  "routes/templates/mutations": typeof routes_templates_mutations;
  "routes/templates/queries": typeof routes_templates_queries;
  "routes/workouts/mutations": typeof routes_workouts_mutations;
  "routes/workouts/queries": typeof routes_workouts_queries;
  "schemas/exercises": typeof schemas_exercises;
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
