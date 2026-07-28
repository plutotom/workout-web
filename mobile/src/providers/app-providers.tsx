import { api } from "@backend/api";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useAction,
} from "convex/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { AuthProvider, useMobileAuth } from "@/auth/auth-provider";
import { LocalDatabaseProvider } from "@/data/local/provider";
import { SyncCoordinator } from "@/data/sync/sync-coordinator";
import { CatalogProvider } from "@/providers/catalog-provider";
import { requirePublicConfig } from "@/lib/config";

export function AppProviders({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => new ConvexReactClient(requirePublicConfig().convexUrl),
    [],
  );

  return (
    <AuthProvider>
      <ConvexProviderWithAuth client={client} useAuth={useMobileAuth}>
        <LocalDatabaseProvider>
          <BootstrapUser />
          <SyncCoordinator />
          <CatalogProvider>{children}</CatalogProvider>
        </LocalDatabaseProvider>
      </ConvexProviderWithAuth>
    </AuthProvider>
  );
}

function BootstrapUser() {
  const { isAuthenticated, user } = useMobileAuth();
  // The action resolves and verifies the email with WorkOS server-side; the
  // client no longer supplies identity attributes.
  const getOrCreate = useAction(api.routes.auth.users.getOrCreate);
  const bootstrapped = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user || bootstrapped.current === user.id) return;
    bootstrapped.current = user.id;
    void getOrCreate({}).catch(() => {
      bootstrapped.current = null;
    });
  }, [getOrCreate, isAuthenticated, user]);

  return null;
}
