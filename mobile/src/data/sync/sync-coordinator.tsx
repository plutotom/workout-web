import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { Alert, AppState } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import { useLocalData, useLocalSyncStore } from "@/data/local/provider";
import {
  convexWorkoutTemplateId,
  type IosBootstrapPayload,
} from "@/data/local/types";
import {
  adoptCloudTemplateId,
  classifyTemplateSyncFailure,
} from "./template-sync-policy";

import { SyncWorker } from "./sync-worker";

const MAX_PUSHES_PER_PASS = 20;

/**
 * Bridges durable SQLite state to Convex. Retryable failures stay queued for a
 * scheduled pass with backoff while foregrounded. Permanent template rejections are
 * quarantined so they cannot block the outbox forever.
 */
export function SyncCoordinator() {
  const { isAuthenticated, user } = useMobileAuth();
  const bootstrap = useQuery(
    api.routes.ios.bootstrap.get,
    isAuthenticated ? {} : "skip",
  );
  const pushSession = useMutation(api.routes.ios.sync.pushSession);
  const deleteSession = useMutation(api.routes.ios.sync.deleteSession);
  const pushCustomExercise = useMutation(
    api.routes.ios.sync.pushCustomExercise,
  );
  const pushPlace = useMutation(api.routes.ios.sync.pushPlace);
  const pushMachine = useMutation(api.routes.ios.sync.pushMachine);
  const pushTemplate = useMutation(api.routes.ios.sync.pushTemplate);
  const { applyBootstrap } = useLocalData();
  const syncStore = useLocalSyncStore();
  const appliedBootstrap = useRef<typeof bootstrap>(undefined);
  const templateLimitAlertShown = useRef(false);

  useEffect(() => {
    if ((bootstrap?.templates.length ?? 0) < 100) {
      templateLimitAlertShown.current = false;
    }
  }, [bootstrap?.templates.length]);

  async function drain(canContinue: () => boolean) {
    if (!canContinue()) return "idle" as const;
    // Pull and acknowledge are serialized: a cloud echo cannot insert a
    // second local identity while an upload's acknowledgment is in flight.
    if (bootstrap && appliedBootstrap.current !== bootstrap) {
      await applyBootstrap(bootstrap as IosBootstrapPayload);
      appliedBootstrap.current = bootstrap;
    }
    if (!canContinue()) return "idle" as const;
    const deviceId = await syncStore.getDeviceId();
    for (let index = 0; index < MAX_PUSHES_PER_PASS; index++) {
      if (!canContinue()) return "idle" as const;

      // Places and machines go first: sessions stamp Convex ids, and a
      // machine upload needs its place to already exist on the server.
      const pendingPlace = await syncStore.getPendingPlace();
      if (!canContinue()) return "idle" as const;
      if (pendingPlace) {
        await syncStore.notePlaceAttempt(pendingPlace.operationId);
        if (!canContinue()) return "idle" as const;
        const result = await pushPlace({
          operationId: pendingPlace.operationId,
          deviceId,
          place: pendingPlace.snapshot,
        });
        await syncStore.completePlace(
          pendingPlace.operationId,
          pendingPlace.placeId,
          result.remotePlaceId,
        );
        if (!canContinue()) return "idle" as const;
        continue;
      }

      const pendingMachine = await syncStore.getPendingMachine();
      if (!canContinue()) return "idle" as const;
      if (pendingMachine) {
        await syncStore.noteMachineAttempt(pendingMachine.operationId);
        if (!canContinue()) return "idle" as const;
        const result = await pushMachine({
          operationId: pendingMachine.operationId,
          deviceId,
          machine: pendingMachine.snapshot,
        });
        await syncStore.completeMachine(
          pendingMachine.operationId,
          pendingMachine.machineId,
          result.remoteMachineId,
        );
        if (!canContinue()) return "idle" as const;
        continue;
      }

      // Custom lifts next: templates and sessions reference them by slug,
      // and until the upload lands that slug is the provisional
      // `custom:local-…` form. Draining them here means the aggregates are
      // rewritten to the durable slug before they are pushed.
      const pendingExercise = await syncStore.getPendingCustomExercise();
      if (!canContinue()) return "idle" as const;
      if (pendingExercise) {
        await syncStore.noteCustomExerciseAttempt(pendingExercise.operationId);
        if (!canContinue()) return "idle" as const;
        const result = await pushCustomExercise({
          operationId: pendingExercise.operationId,
          deviceId,
          exercise: pendingExercise.snapshot,
        });
        await syncStore.completeCustomExercise(
          pendingExercise.operationId,
          pendingExercise.exerciseId,
          result.remoteExerciseId,
          result.slug,
        );
        if (!canContinue()) return "idle" as const;
        continue;
      }

      const pendingDelete = await syncStore.getPendingSessionDelete();
      if (!canContinue()) return "idle" as const;
      if (pendingDelete) {
        await syncStore.noteSessionAttempt(pendingDelete.operationId);
        if (!canContinue()) return "idle" as const;
        await deleteSession({
          operationId: pendingDelete.operationId,
          deviceId,
          session: pendingDelete.snapshot,
        });
        await syncStore.completeSessionDelete(pendingDelete.operationId);
        if (!canContinue()) return "idle" as const;
        continue;
      }

      const pendingSession = await syncStore.getPendingSession();
      if (!canContinue()) return "idle" as const;
      if (pendingSession) {
        await syncStore.noteSessionAttempt(pendingSession.operationId);
        if (!canContinue()) return "idle" as const;
        const result = await pushSession({
          operationId: pendingSession.operationId,
          deviceId,
          session: {
            ...pendingSession.snapshot,
            remoteTemplateId: convexWorkoutTemplateId(
              pendingSession.snapshot.remoteTemplateId,
            ) as Id<"workoutTemplates"> | null,
            placeId: pendingSession.snapshot.placeId as
              | Id<"places">
              | null
              | undefined,
            exercises: pendingSession.snapshot.exercises.map((exercise) => ({
              ...exercise,
              machineId: exercise.machineId as
                | Id<"machines">
                | null
                | undefined,
            })),
          },
        });
        await syncStore.completeSession(
          pendingSession.operationId,
          pendingSession.sessionId,
          result.remoteSessionId,
        );
        if (!canContinue()) return "idle" as const;
        continue;
      }

      const pendingTemplate = await syncStore.getPendingTemplate();
      if (!canContinue() || !pendingTemplate) return "idle" as const;
      // Template cap precheck needs the bootstrap snapshot; sessions and
      // places above can drain without it so a slow/failed bootstrap cannot
      // stall the rest of the outbox.
      if (!bootstrap) return "idle" as const;
      await syncStore.noteTemplateAttempt(pendingTemplate.operationId);
      if (!canContinue()) return "idle" as const;
      try {
        const { snapshot } = pendingTemplate;
        const adoptedRemoteId =
          snapshot.remoteId ??
          adoptCloudTemplateId(snapshot, bootstrap.templates);
        if (!adoptedRemoteId && bootstrap.templates.length >= 100) {
          await syncStore.quarantineTemplate(pendingTemplate.operationId);
          if (canContinue() && !templateLimitAlertShown.current) {
            templateLimitAlertShown.current = true;
            Alert.alert(
              "Template saved on this device",
              "Your account already has 100 templates, so this template can’t sync. Delete a cloud template, then edit the template to try again.",
            );
          }
          continue;
        }
        const result = await pushTemplate({
          operationId: pendingTemplate.operationId,
          deviceId,
          template: {
            remoteId: adoptedRemoteId as Id<"workoutTemplates"> | null,
            name: snapshot.name,
            exercises: snapshot.exercises,
          },
        });
        await syncStore.completeTemplate(
          pendingTemplate.operationId,
          pendingTemplate.templateId,
          result.remoteTemplateId,
        );
        if (!canContinue()) return "idle" as const;
      } catch (error) {
        const failure = classifyTemplateSyncFailure(error);
        if (failure.kind === "permanent") {
          await syncStore.quarantineTemplate(pendingTemplate.operationId);
          console.warn("[template-sync] quarantined permanent failure", {
            code: failure.code,
            operationId: pendingTemplate.operationId,
            templateId: pendingTemplate.templateId,
          });
          if (canContinue() && !templateLimitAlertShown.current) {
            templateLimitAlertShown.current = true;
            Alert.alert(
              "Template saved on this device",
              "Your account already has 100 templates, so this template can’t sync. Delete a cloud template, then edit this template to try again.",
            );
          }
          continue;
        }
        // Connectivity/auth/unknown failures remain queued for a later pass.
        throw error;
      }
    }
    return "more" as const;
  }

  // Use the latest stores and subscriptions without cancelling an in-flight
  // acknowledgment whenever SQLite revision or a cloud subscription changes.
  const drainRef = useRef(drain);
  useEffect(() => {
    drainRef.current = drain;
  });
  const workerRef = useRef<SyncWorker | null>(null);

  useEffect(() => {
    const worker =
      workerRef.current ??
      new SyncWorker(
        (canContinue) => drainRef.current(canContinue),
        (error) =>
          console.warn("[sync] retry scheduled after failed sync", error),
      );
    workerRef.current = worker;
    appliedBootstrap.current = undefined;
    worker.setEnabled(isAuthenticated && AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) => {
      worker.setEnabled(isAuthenticated && state === "active");
    });
    return () => {
      worker.setEnabled(false);
      subscription.remove();
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    workerRef.current?.wake();
  }, [bootstrap, syncStore.revision]);

  return null;
}
