import { api } from "@backend/api";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useMutation,
} from "convex/react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { AuthProvider, useMobileAuth } from "@/auth/auth-provider";
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
        <BootstrapUser />
        <CatalogProvider>{children}</CatalogProvider>
      </ConvexProviderWithAuth>
    </AuthProvider>
  );
}

function BootstrapUser() {
  const { isAuthenticated, user } = useMobileAuth();
  const getOrCreate = useMutation(api.routes.auth.users.getOrCreate);
  const bootstrapped = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user || bootstrapped.current === user.id) return;
    bootstrapped.current = user.id;
    void getOrCreate({ email: user.email }).catch(() => {
      bootstrapped.current = null;
    });
  }, [getOrCreate, isAuthenticated, user]);

  return null;
}
