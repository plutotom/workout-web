"use client";

import { useQuery } from "convex/react";
import { useQuery as useCacheQuery } from "convex-helpers/react/cache/hooks";

import { api } from "@backend/api";

import { useEntitlementWithDevOverride } from "./use-dev-pro-override";

/** Live entitlement with dev Pro/Free override (web, default Convex hook). */
export function useEntitlement() {
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  return useEntitlementWithDevOverride(entitlement);
}

/** Cached entitlement with dev override (settings pages). */
export function useEntitlementCached() {
  const entitlement = useCacheQuery(api.routes.auth.users.entitlement);
  return useEntitlementWithDevOverride(entitlement);
}
