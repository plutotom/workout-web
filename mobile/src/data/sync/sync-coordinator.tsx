import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { useMobileAuth } from "@/auth/auth-provider";
import { useLocalData, useLocalSyncStore } from "@/data/local/provider";
import type { IosBootstrapPayload } from "@/data/local/types";

const MAX_PUSHES_PER_PASS = 20;

/**
 * Bridges durable SQLite state to Convex. Failures are intentionally silent:
 * local writes have already committed, and a later foreground/reconnect pass
 * retries the newest aggregate from the outbox.
 */
export function SyncCoordinator() {
  const { isAuthenticated } = useMobileAuth();
  const bootstrap = useQuery(
    api.routes.ios.bootstrap.get,
    isAuthenticated ? {} : "skip",
  );
  const pushSession = useMutation(api.routes.ios.sync.pushSession);
  const { applyBootstrap } = useLocalData();
  const syncStore = useLocalSyncStore();
  const appliedBootstrap = useRef<number | null>(null);

  useEffect(() => {
    if (!bootstrap || appliedBootstrap.current === bootstrap.serverTime) return;
    appliedBootstrap.current = bootstrap.serverTime;
    void applyBootstrap(bootstrap as IosBootstrapPayload).catch(() => {
      appliedBootstrap.current = null;
    });
  }, [applyBootstrap, bootstrap]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void (async () => {
      const deviceId = await syncStore.getDeviceId();
      for (let index = 0; index < MAX_PUSHES_PER_PASS; index++) {
        if (cancelled) return;
        const pending = await syncStore.getPending();
        if (!pending) return;
        await syncStore.noteAttempt(pending.operationId);
        try {
          const result = await pushSession({
            operationId: pending.operationId,
            deviceId,
            session: {
              ...pending.snapshot,
              remoteTemplateId: pending.snapshot
                .remoteTemplateId as Id<"workoutTemplates"> | null,
            },
          });
          if (cancelled) return;
          await syncStore.complete(
            pending.operationId,
            pending.sessionId,
            result.remoteSessionId,
          );
        } catch {
          // Connectivity/auth failures remain queued. A future revision,
          // bootstrap, or app foreground will retry the latest snapshot.
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, pushSession, syncStore, syncStore.revision]);

  return null;
}
