import { api } from "@backend/api";
import { useQuery } from "convex/react";

import { useMobileAuth } from "@/auth/auth-provider";
import { useLoadTiming } from "@/lib/use-performance-timing";

/** Start these subscriptions at account connection, and retain them across tabs. */
export function SocialQueryProvider() {
  const { isAuthenticated } = useMobileAuth();
  const args = isAuthenticated ? {} : "skip";
  const feed = useQuery(api.routes.social.queries.feed, args);
  const me = useQuery(api.routes.social.queries.me, args);
  const notifications = useQuery(api.routes.social.queries.notifications, args);
  useLoadTiming("social.feed", isAuthenticated, feed !== undefined);
  useLoadTiming("social.me", isAuthenticated, me !== undefined);
  useLoadTiming(
    "social.notifications",
    isAuthenticated,
    notifications !== undefined,
  );
  return null;
}
