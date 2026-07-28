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
  const createTemplate = useMutation(api.routes.templates.mutations.create);
  const updateTemplate = useMutation(api.routes.templates.mutations.update);
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

        const pendingSession = await syncStore.getPendingSession();
        if (pendingSession) {
          await syncStore.noteSessionAttempt(pendingSession.operationId);
          try {
            const result = await pushSession({
              operationId: pendingSession.operationId,
              deviceId,
              session: {
                ...pendingSession.snapshot,
                remoteTemplateId: pendingSession.snapshot
                  .remoteTemplateId as Id<"workoutTemplates"> | null,
              },
            });
            if (cancelled) return;
            await syncStore.completeSession(
              pendingSession.operationId,
              pendingSession.sessionId,
              result.remoteSessionId,
            );
          } catch {
            return;
          }
          continue;
        }

        const pendingTemplate = await syncStore.getPendingTemplate();
        if (!pendingTemplate) return;
        await syncStore.noteTemplateAttempt(pendingTemplate.operationId);
        try {
          const { snapshot } = pendingTemplate;
          let remoteTemplateId = snapshot.remoteId;
          if (remoteTemplateId) {
            await updateTemplate({
              templateId: remoteTemplateId as Id<"workoutTemplates">,
              name: snapshot.name,
              exercises: snapshot.exercises,
            });
          } else {
            remoteTemplateId = await createTemplate({
              name: snapshot.name,
              exercises: snapshot.exercises,
            });
          }
          if (cancelled) return;
          await syncStore.completeTemplate(
            pendingTemplate.operationId,
            pendingTemplate.templateId,
            remoteTemplateId,
          );
        } catch {
          // Connectivity/auth failures remain queued for a later pass.
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    createTemplate,
    isAuthenticated,
    pushSession,
    syncStore,
    syncStore.revision,
    updateTemplate,
  ]);

  return null;
}
