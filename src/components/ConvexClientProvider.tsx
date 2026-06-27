"use client";

import {
  AuthKitProvider,
  useAccessToken,
  useAuth,
} from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";
import { type ReactNode, useCallback, useState } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const [convex] = useState(() =>
    convexUrl ? new ConvexReactClient(convexUrl) : null,
  );

  return (
    <AuthKitProvider>
      {convex ? (
        <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
          {/* Keeps query subscriptions warm for a while after a component
              unmounts, so navigating between tabs returns cached data
              instantly instead of flashing a loading state every time. */}
          <ConvexQueryCacheProvider>{children}</ConvexQueryCacheProvider>
        </ConvexProviderWithAuth>
      ) : (
        children
      )}
    </AuthKitProvider>
  );
}

function useAuthFromAuthKit() {
  const { user, loading: isLoading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();
  const isAuthenticated = !!user;

  const fetchAccessToken = useCallback(
    async ({
      forceRefreshToken,
    }: { forceRefreshToken?: boolean } = {}): Promise<string | null> => {
      if (!user) {
        return null;
      }

      try {
        if (forceRefreshToken) {
          return (await refresh()) ?? null;
        }

        return (await getAccessToken()) ?? null;
      } catch (error) {
        console.error("Failed to get access token:", error);
        return null;
      }
    },
    [user, refresh, getAccessToken],
  );

  return {
    isLoading,
    isAuthenticated,
    fetchAccessToken,
  };
}
