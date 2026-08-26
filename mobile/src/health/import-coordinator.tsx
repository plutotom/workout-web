import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import {
  useHealthAutoImportPrefs,
  useLocalData,
  useLocalPreferences,
} from "@/data/local/provider";
import {
  getHealthAutoImportAnchor,
  importHealthSummarySession,
  listIgnoredHealthIds,
  listImportedHealthIds,
  listLocalOverlapCandidates,
  setHealthAutoImportAnchor,
} from "@/data/local/repository";
import { getHealthAdapter } from "@/health";
import {
  decideAutoImport,
  shouldNotifyAutoImport,
  toHealthSummaryImport,
} from "@/health/auto-import";
import { APP_BUNDLE_ID } from "@/health/mapping";
import { notifyAutoImportedWorkouts } from "@/health/notify";
import type {
  HealthAutoImportPrefs,
  HealthWorkoutSummary,
} from "@/health/types";

const PAGES_PER_DRAIN = 10;

function prefsKey(prefs: HealthAutoImportPrefs | undefined) {
  if (!prefs) return "";
  return `${prefs.enabled}|${prefs.importAllTypes}|${[...prefs.types].sort().join(",")}`;
}

/**
 * Imports matching Apple Health workouts when auto-import is on.
 * Health deletions never remove local copies. Duplicates, filters, and
 * strength overlaps stay silent.
 */
export function HealthImportCoordinator() {
  const db = useSQLiteContext();
  const { refresh } = useLocalData();
  const prefs = useHealthAutoImportPrefs();
  const localPreferences = useLocalPreferences();
  const prefsRef = useRef(prefs);
  const draining = useRef(false);
  const rerun = useRef(false);
  const filterKey = prefsKey(prefs);
  const prefsReady = prefs !== undefined;
  const autoImportEnabled = prefs?.enabled === true;

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const drain = useCallback(async () => {
    if (draining.current) {
      rerun.current = true;
      return;
    }
    draining.current = true;
    try {
      do {
        rerun.current = false;
        const currentPrefs = prefsRef.current;
        if (!currentPrefs?.enabled) return;
        const adapter = getHealthAdapter();
        if (!(await adapter.isAvailable())) return;
        const auth = await adapter.getAuthorizationState();
        if (auth === "unavailable" || auth === "not_requested") return;

        const importedNow: HealthWorkoutSummary[] = [];
        for (let page = 0; page < PAGES_PER_DRAIN; page++) {
          const anchor = await getHealthAutoImportAnchor(db);
          const result = await adapter.queryWorkoutsSinceAnchor({
            anchor,
            limit: 100,
          });
          const [imported, ignored, overlapCandidates] = await Promise.all([
            listImportedHealthIds(db),
            listIgnoredHealthIds(db),
            listLocalOverlapCandidates(db),
          ]);
          const importedIds = new Set(imported.keys());
          for (const workout of result.workouts) {
            const decision = decideAutoImport({
              workout,
              prefs: currentPrefs,
              imported: importedIds,
              ignored,
              overlapCandidates,
              appBundleId: APP_BUNDLE_ID,
            });
            if (decision.action !== "import") continue;
            try {
              const outcome = await importHealthSummarySession(
                db,
                toHealthSummaryImport(workout),
              );
              importedIds.add(workout.uuid);
              if (!outcome.alreadyImported) importedNow.push(workout);
            } catch {
              // Leave it for manual import. Do not notify.
            }
          }
          if (result.newAnchor && result.newAnchor !== anchor) {
            await setHealthAutoImportAnchor(db, result.newAnchor);
          }
          if (
            result.workouts.length + result.deletedUuids.length === 0 ||
            result.workouts.length < 100
          ) {
            break;
          }
        }

        if (importedNow.length > 0) refresh();
        const notify = importedNow.filter((workout) =>
          shouldNotifyAutoImport(workout),
        );
        if (
          localPreferences?.appleHealthImportNotificationsEnabled &&
          notify.length > 0
        ) {
          await notifyAutoImportedWorkouts(notify);
        }
      } while (rerun.current);
    } finally {
      draining.current = false;
    }
  }, [db, localPreferences?.appleHealthImportNotificationsEnabled, refresh]);

  useEffect(() => {
    if (!prefsReady) return;
    const adapter = getHealthAdapter();
    if (!autoImportEnabled) {
      void adapter.disableBackgroundDelivery().catch(() => undefined);
      return;
    }
    void adapter.enableBackgroundDelivery().catch(() => undefined);
    const sub = adapter.subscribeToWorkoutChanges(() => {
      void drain();
    });
    return () => sub.remove();
  }, [autoImportEnabled, drain, prefsReady]);

  useEffect(() => {
    if (!autoImportEnabled) return;
    void drain();
  }, [autoImportEnabled, drain, filterKey]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void drain();
    });
    return () => sub.remove();
  }, [drain]);

  return null;
}
