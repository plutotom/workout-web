"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  applyDevProEntitlementOverride,
  readDevProOverride,
  subscribeDevProOverride,
  writeDevProOverride,
  type DevProOverride,
} from "@/lib/dev-pro-override";

export function useDevProOverride(): [
  DevProOverride,
  (value: DevProOverride) => void,
] {
  const override = useSyncExternalStore(
    subscribeDevProOverride,
    readDevProOverride,
    readDevProOverride,
  );
  const setOverride = useCallback((value: DevProOverride) => {
    writeDevProOverride(value);
  }, []);
  return [override, setOverride];
}

/** Convex `entitlement` query with optional local dev override applied. */
export function useEntitlementWithDevOverride<
  T extends Parameters<typeof applyDevProEntitlementOverride>[0],
>(entitlement: T): ReturnType<typeof applyDevProEntitlementOverride<T>> {
  const [override] = useDevProOverride();
  return applyDevProEntitlementOverride(entitlement, override);
}
