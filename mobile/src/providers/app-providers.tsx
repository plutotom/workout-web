import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";

import { AuthProvider, useAuthCredentials } from "@/auth/auth-provider";
import { MobileAccountProvider } from "@/auth/account-provider";
import { LocalDatabaseProvider } from "@/data/local/provider";
import { SyncCoordinator } from "@/data/sync/sync-coordinator";
import { CatalogProvider } from "@/providers/catalog-provider";
import { requirePublicConfig } from "@/lib/config";
import { HealthExportCoordinator } from "@/health/export-coordinator";
import { HealthImportCoordinator } from "@/health/import-coordinator";
import { WatchHealthCoordinator } from "@/health/watch-coordinator";

export function AppProviders({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => new ConvexReactClient(requirePublicConfig().convexUrl),
    [],
  );

  return (
    <AuthProvider>
      <ConvexProviderWithAuth client={client} useAuth={useAuthCredentials}>
        <MobileAccountProvider>
          <LocalDatabaseProvider>
            <SyncCoordinator />
            <HealthExportCoordinator />
            <HealthImportCoordinator />
            <WatchHealthCoordinator />
            <CatalogProvider>{children}</CatalogProvider>
          </LocalDatabaseProvider>
        </MobileAccountProvider>
      </ConvexProviderWithAuth>
    </AuthProvider>
  );
}
