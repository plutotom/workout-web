import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { useMemo, useSyncExternalStore } from "react";

import {
  applyDevProEntitlementOverride,
  readDevProOverride,
  subscribeDevProOverride,
  type DevProOverride,
} from "@shared/dev-pro-override";

function useDevProOverride(): DevProOverride {
  return useSyncExternalStore(
    subscribeDevProOverride,
    readDevProOverride,
    readDevProOverride,
  );
}

/** Keep the server grant available for writes that Convex will authorize. */
export function useEntitlementState(skip?: boolean) {
  const raw = useQuery(api.routes.auth.users.entitlement, skip ? "skip" : {});
  const override = useDevProOverride();
  return useMemo(
    () => ({
      entitlement: applyDevProEntitlementOverride(raw, override),
      serverEntitlement: raw,
    }),
    [raw, override],
  );
}

/** Convex entitlement with optional local dev Pro/Free override. */
export function useEntitlement(skip?: boolean) {
  return useEntitlementState(skip).entitlement;
}
