import { api } from "@backend/api";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  MobileAccountContext,
  type MobileAccountStatus,
} from "./account-context";
import { useAuthCredentials } from "./auth-provider";

const CONNECTION_TIMEOUT_MS = 15_000;

export function MobileAccountProvider({ children }: { children: ReactNode }) {
  const credentials = useAuthCredentials();
  const { reconnect } = credentials;
  const auth = useConvexAuth();
  const authenticated =
    credentials.isAuthenticated &&
    !credentials.loading &&
    auth.isAuthenticated &&
    !auth.isRefreshing;
  const account = useQuery(
    api.routes.auth.users.current,
    authenticated ? {} : "skip",
  );
  const getOrCreate = useAction(api.routes.auth.users.getOrCreate);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const userId = credentials.user?.id;
  const connectionKey = `${userId ?? ""}:${attempt}`;
  const bootstrapKey = authenticated && userId ? connectionKey : null;
  const [bootstrap, setBootstrap] = useState({
    key: bootstrapKey,
    complete: false,
  });
  // A retry, auth interruption, or account switch needs its own bootstrap.
  if (bootstrap.key !== bootstrapKey) {
    setBootstrap({ key: bootstrapKey, complete: false });
  }
  const ready = Boolean(
    authenticated &&
    bootstrap.key === connectionKey &&
    bootstrap.complete &&
    account &&
    account.workosId === userId,
  );

  useEffect(() => {
    if (!bootstrapKey) return;
    let active = true;
    // Existing rows also need verified email updates and profile migrations.
    void getOrCreate({})
      .then(() => {
        if (active) setBootstrap({ key: bootstrapKey, complete: true });
      })
      .catch((error) => {
        if (!active) return;
        console.warn("[account] bootstrap failed", error);
        setFailure(bootstrapKey);
      });
    return () => {
      active = false;
    };
  }, [bootstrapKey, getOrCreate]);

  useEffect(() => {
    if (ready || !userId) return;
    const timer = setTimeout(
      () => setFailure(connectionKey),
      CONNECTION_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [connectionKey, userId, ready]);

  const retry = useCallback(async () => {
    setAttempt((value) => value + 1);
    setFailure(null);
    await reconnect();
  }, [reconnect]);

  let status: MobileAccountStatus;
  if (ready) status = "ready";
  else if (failure === connectionKey) status = "error";
  else if (
    credentials.loading ||
    auth.isLoading ||
    auth.isRefreshing ||
    authenticated
  )
    status = "connecting";
  else status = credentials.user ? "error" : "offline";

  return (
    <MobileAccountContext.Provider value={{ status, retry }}>
      {children}
    </MobileAccountContext.Provider>
  );
}
