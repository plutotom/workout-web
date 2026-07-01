"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";

import { api } from "@backend/api";

/**
 * Subscribes to the low-data queries behind the main tabs from the persistent
 * app layout, so they're already loaded (and kept warm by the query cache)
 * before you first tap into Dashboard / Templates / Settings. Renders nothing.
 *
 * History is intentionally left out — it's heavier and per-template, so it
 * loads on demand (and still benefits from the cache on repeat visits).
 */
export function WarmQueries() {
  useQuery(api.routes.workouts.queries.active);
  useQuery(api.routes.workouts.queries.recent);
  useQuery(api.routes.templates.queries.list);
  useQuery(api.routes.auth.users.current);
  useQuery(api.routes.insights.queries.overview, { days: 30 });
  return null;
}
