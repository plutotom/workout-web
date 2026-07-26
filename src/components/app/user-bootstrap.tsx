"use client";

import { useEffect, useRef } from "react";
import { useAction, useConvexAuth } from "convex/react";

import { api } from "@backend/api";

/**
 * Idempotently ensures the signed-in user has a row in Convex. Renders nothing.
 * Runs once auth is ready; `getOrCreate` is a no-op if the row already exists.
 */
export function UserBootstrap() {
  const { isAuthenticated } = useConvexAuth();
  const getOrCreate = useAction(api.routes.auth.users.getOrCreate);
  const ran = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || ran.current) return;
    ran.current = true;
    void getOrCreate({});
  }, [isAuthenticated, getOrCreate]);

  return null;
}
