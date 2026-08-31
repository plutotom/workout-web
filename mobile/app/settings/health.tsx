import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Check, HeartPulse } from "lucide-react-native";

import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Screen,
  SectionTitle,
  Segmented,
} from "@/components/ui";
import { useMobileAuth } from "@/auth/auth-provider";
import {
  useHealthAutoImportPrefs,
  useHealthExportPrefs,
  useHealthImportLookups,
  useLocalData,
  useLocalPreferences,
} from "@/data/local/provider";
import { formatDuration } from "@/lib/format";
import {
  getHealthAdapter,
  HEALTH_LOOKBACK_MS,
  type HealthAuthorizationState,
  type HealthListItem,
  type HealthOverlapCandidate,
  type HealthWorkoutSummary,
} from "@/health";
import { HealthActivityIcon } from "@/health/activity-icon";
import {
  AUTO_IMPORT_TYPE_OPTIONS,
  DEFAULT_AUTO_IMPORT_TYPES,
} from "@/health/auto-import";
import {
  formatHealthDistance,
  formatHealthEnergy,
  formatHealthSportLine,
  isStrengthActivityType,
} from "@/health/mapping";
import { findLikelyHealthOverlap } from "@/health/overlap";
import { colors, radius } from "@/theme";

function toImport(workout: HealthWorkoutSummary) {
  return {
    uuid: workout.uuid,
    activityType: workout.activityType,
    activityName: workout.activityName,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationSeconds: workout.durationSeconds,
    energyKcal: workout.energyKcal,
    distanceMeters: workout.distanceMeters,
    sourceName: workout.sourceName,
    sourceBundleId: workout.sourceBundleId,
    segments: workout.segments ?? [],
  };
}

function formatWhen(startedAt: number) {
  const date = new Date(startedAt);
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} · ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

async function loadHealthState(
  requestAccess: boolean,
  markRequested: () => Promise<void>,
): Promise<{
  auth: HealthAuthorizationState;
  workouts: HealthWorkoutSummary[];
  queryError: string | null;
}> {
  const adapter = getHealthAdapter();
  const available = await adapter.isAvailable();
  if (!available) {
    return { auth: "unavailable", workouts: [], queryError: null };
  }
  let state = await adapter.getAuthorizationState();
  if (requestAccess && state !== "unavailable") {
    try {
      state = await adapter.requestReadAccess();
      await markRequested();
    } catch {
      return {
        auth: state,
        workouts: [],
        queryError: "Couldn’t connect to Apple Health.",
      };
    }
  }
  if (state === "not_requested") {
    return { auth: state, workouts: [], queryError: null };
  }
  try {
    const results = await adapter.queryRecentWorkouts({
      since: Date.now() - HEALTH_LOOKBACK_MS,
    });
    return { auth: state, workouts: results, queryError: null };
  } catch {
    return {
      auth: state,
      workouts: [],
      queryError: "Couldn’t load workouts from Apple Health.",
    };
  }
}

export default function HealthSettingsScreen() {
  const { isAuthenticated } = useMobileAuth();
  const lookups = useHealthImportLookups();
  const prefs = useLocalPreferences();
  const {
    importHealthSummary,
    linkHealthSummary,
    ignoreHealthUuid,
    markHealthAuthRequested,
    setHealthExportEnabled,
    setHealthAutoImportPrefs,
    deleteSession,
    refresh: refreshLocal,
  } = useLocalData();
  const exportPrefs = useHealthExportPrefs();
  const autoImportPrefs = useHealthAutoImportPrefs();
  const [auth, setAuth] = useState<HealthAuthorizationState | null>(null);
  const [workouts, setWorkouts] = useState<HealthWorkoutSummary[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);
  const [failedUuids, setFailedUuids] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<HealthListItem | null>(null);
  const [writeAuth, setWriteAuth] = useState<HealthAuthorizationState | null>(
    null,
  );
  const [exportBusy, setExportBusy] = useState(false);
  const [autoImportBusy, setAutoImportBusy] = useState(false);
  const unit = prefs?.unit ?? "lb";
  const exportEnabled = exportPrefs?.enabled === true;

  const applyHealthState = useCallback(
    (result: {
      auth: HealthAuthorizationState;
      workouts: HealthWorkoutSummary[];
      queryError: string | null;
    }) => {
      setAuth(result.auth);
      setWorkouts(result.workouts);
      setQueryError(result.queryError);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void loadHealthState(false, markHealthAuthRequested).then((result) => {
      if (!cancelled) applyHealthState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyHealthState, markHealthAuthRequested]);

  useEffect(() => {
    let cancelled = false;
    void getHealthAdapter()
      .getWriteAuthorizationState()
      .then((state) => {
        if (!cancelled) setWriteAuth(state);
      });
    return () => {
      cancelled = true;
    };
  }, [exportEnabled]);

  async function refresh() {
    setRefreshing(true);
    try {
      applyHealthState(
        await loadHealthState(
          lookups?.authRequested === true,
          markHealthAuthRequested,
        ),
      );
    } finally {
      setRefreshing(false);
    }
  }

  const items: HealthListItem[] = useMemo(() => {
    if (!workouts || !lookups) return [];
    return workouts.map((workout) => {
      const imported = lookups.imported.get(workout.uuid);
      if (imported) {
        return {
          ...workout,
          state: { kind: "imported", sessionId: imported.sessionId },
        };
      }
      if (failedUuids.has(workout.uuid)) {
        return {
          ...workout,
          state: {
            kind: "error",
            message: "Import failed. Try again.",
          },
        };
      }
      if (
        isStrengthActivityType(workout.activityType) &&
        !lookups.ignored.has(workout.uuid)
      ) {
        const overlap = findLikelyHealthOverlap(
          {
            startedAt: workout.startedAt,
            completedAt: workout.endedAt,
          },
          lookups.overlapCandidates,
        );
        if (overlap) {
          return {
            ...workout,
            state: {
              kind: "review",
              overlap: {
                sessionId: overlap.sessionId,
                templateName: overlap.templateName,
                startedAt: overlap.startedAt,
                completedAt: overlap.completedAt,
              },
            },
          };
        }
      }
      return { ...workout, state: { kind: "import" } };
    });
  }, [failedUuids, lookups, workouts]);

  async function importWorkout(workout: HealthWorkoutSummary) {
    setBusyUuid(workout.uuid);
    setFailedUuids((current) => {
      if (!current.has(workout.uuid)) return current;
      const next = new Set(current);
      next.delete(workout.uuid);
      return next;
    });
    try {
      const result = await importHealthSummary(toImport(workout));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotice(
        result.alreadyImported
          ? "Already in Grayed Lift"
          : isAuthenticated
            ? `${workout.activityName} imported`
            : `${workout.activityName} imported. It will sync to your account after you sign in.`,
      );
    } catch {
      setFailedUuids((current) => new Set(current).add(workout.uuid));
      setNotice("Import failed. Try again.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusyUuid(null);
    }
  }

  async function toggleExport(next: "on" | "off") {
    if (exportBusy) return;
    if (next === "off") {
      await setHealthExportEnabled(false);
      return;
    }
    setExportBusy(true);
    try {
      const adapter = getHealthAdapter();
      const state = await adapter.requestWriteAccess();
      setWriteAuth(state);
      if (state === "unavailable" || state === "not_requested") {
        await setHealthExportEnabled(false);
        setNotice(
          state === "unavailable"
            ? "Apple Health is not available on this device."
            : "Write access was not granted. Saving stays off.",
        );
        return;
      }
      await setHealthExportEnabled(true);
      setNotice(
        "Finished workouts will save to Apple Health as Strength training.",
      );
    } catch {
      await setHealthExportEnabled(false);
      setNotice("Couldn’t enable Apple Health export.");
    } finally {
      setExportBusy(false);
    }
  }

  async function retryPendingExports() {
    setExportBusy(true);
    try {
      const state = await getHealthAdapter().requestWriteAccess();
      setWriteAuth(state);
      refreshLocal();
    } finally {
      setExportBusy(false);
    }
  }

  async function toggleAutoImport(next: "on" | "off") {
    if (autoImportBusy || autoImportPrefs === undefined) return;
    if (next === "off") {
      await setHealthAutoImportPrefs({ ...autoImportPrefs, enabled: false });
      return;
    }
    setAutoImportBusy(true);
    try {
      const adapter = getHealthAdapter();
      const state = await adapter.requestReadAccess();
      await markHealthAuthRequested();
      applyHealthState(await loadHealthState(false, markHealthAuthRequested));
      if (state === "unavailable" || state === "not_requested") {
        await setHealthAutoImportPrefs({ ...autoImportPrefs, enabled: false });
        setNotice(
          state === "unavailable"
            ? "Apple Health is not available on this device."
            : "Read access was not granted. Automatic import stays off.",
        );
        return;
      }
      await setHealthAutoImportPrefs({
        ...autoImportPrefs,
        enabled: true,
        types:
          autoImportPrefs.types.length > 0
            ? autoImportPrefs.types
            : [...DEFAULT_AUTO_IMPORT_TYPES],
      });
      setNotice("Matching workouts will import automatically.");
    } catch {
      await setHealthAutoImportPrefs({ ...autoImportPrefs, enabled: false });
      setNotice("Couldn’t enable automatic import.");
    } finally {
      setAutoImportBusy(false);
    }
  }

  async function removeImported(sessionId: string) {
    Alert.alert(
      "Remove from Grayed Lift?",
      "The original workout stays in Apple Health. Only this copy in Grayed Lift is removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void deleteSession(sessionId).then(() => {
              setNotice("Removed from Grayed Lift");
            }),
        },
      ],
    );
  }

  const permissionHint =
    auth === "unavailable"
      ? "Apple Health is not available on this device."
      : auth === "not_requested"
        ? "Connect to review workouts from the last 90 days."
        : workouts?.length === 0
          ? "No workouts available or access may be limited."
          : "Read access is requested for workouts only.";

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          tintColor={colors.text}
        />
      }
    >
      <PageHeader
        back
        eyebrow="SETTINGS"
        title="Apple Health"
        subtitle="Import a workout from the last 90 days, save lifts you finish here, or automatically import matching activities."
      />

      <Card>
        <HeartPulse color={colors.text} size={22} />
        <SectionTitle title="Permission status" />
        <StatusRow
          label="Apple Health connection"
          value={
            auth === "unavailable"
              ? "Unavailable"
              : auth === "not_requested"
                ? "Not connected"
                : "Connected"
          }
        />
        <StatusRow
          label="Read Workouts"
          value={
            auth === "not_requested"
              ? "Not requested"
              : workouts && workouts.length > 0
                ? "Workouts available"
                : "No workouts available or access may be limited"
          }
        />
        <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}>
          {permissionHint}
        </Text>
        {auth === "unavailable" ? null : auth === "not_requested" ? (
          <Button
            label="Connect Apple Health"
            onPress={() =>
              void loadHealthState(true, markHealthAuthRequested).then(
                applyHealthState,
              )
            }
          />
        ) : (
          <Button
            label="Review access in iOS Settings"
            variant="outline"
            onPress={() => void Linking.openSettings()}
          />
        )}
      </Card>

      {auth === "unavailable" ? null : (
        <Card>
          <SectionTitle title="Save workouts to Apple Health" />
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
            When you finish an in-app workout, save it as Strength training.
            Calories are not estimated.
          </Text>
          <Segmented
            value={exportPrefs?.enabled ? "on" : "off"}
            options={[
              { value: "off" as const, label: "Off" },
              { value: "on" as const, label: "On" },
            ]}
            onChange={(next) => {
              if (exportBusy || exportPrefs === undefined) return;
              void toggleExport(next);
            }}
          />
          <StatusRow
            label="Write Workouts"
            value={
              !exportEnabled
                ? "Off"
                : writeAuth === "not_requested"
                  ? "Not granted"
                  : writeAuth === "unavailable"
                    ? "Unavailable"
                    : writeAuth === "limited"
                      ? "Limited"
                      : "Allowed"
            }
          />
          {exportPrefs && exportPrefs.pendingCount > 0 ? (
            <>
              <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}>
                {exportPrefs.pendingCount === 1
                  ? "1 finished workout is waiting to save."
                  : `${exportPrefs.pendingCount} finished workouts are waiting to save.`}
              </Text>
              <Button
                label={exportBusy ? "Retrying…" : "Retry save"}
                variant="outline"
                disabled={exportBusy || !exportEnabled}
                onPress={() => void retryPendingExports()}
              />
            </>
          ) : null}
        </Card>
      )}

      {auth === "unavailable" ? null : (
        <Card>
          <SectionTitle title="Automatic import" />
          <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
            Import matching workouts when they appear in Apple Health. Manual
            import still works for every type.
          </Text>
          <Segmented
            value={autoImportPrefs?.enabled ? "on" : "off"}
            options={[
              { value: "off" as const, label: "Off" },
              { value: "on" as const, label: "On" },
            ]}
            onChange={(next) => {
              if (autoImportBusy || autoImportPrefs === undefined) return;
              void toggleAutoImport(next);
            }}
          />
          {autoImportPrefs?.enabled ? (
            <>
              <View style={{ gap: 7 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  Types
                </Text>
                <Segmented
                  value={autoImportPrefs.importAllTypes ? "all" : "selected"}
                  options={[
                    { value: "selected" as const, label: "Selected" },
                    { value: "all" as const, label: "Import all" },
                  ]}
                  onChange={(next) => {
                    if (autoImportBusy) return;
                    void setHealthAutoImportPrefs({
                      ...autoImportPrefs,
                      importAllTypes: next === "all",
                    });
                  }}
                />
              </View>
              {autoImportPrefs.importAllTypes ? (
                <Text
                  style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}
                >
                  Every Health workout type can import. Strength workouts that
                  overlap a lift you already logged still wait for Review.
                </Text>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {AUTO_IMPORT_TYPE_OPTIONS.map((option) => {
                    const selected = autoImportPrefs.types.includes(
                      option.type,
                    );
                    return (
                      <Pressable
                        key={option.type}
                        onPress={() => {
                          if (autoImportBusy) return;
                          const types = selected
                            ? autoImportPrefs.types.filter(
                                (type) => type !== option.type,
                              )
                            : [...autoImportPrefs.types, option.type];
                          void setHealthAutoImportPrefs({
                            ...autoImportPrefs,
                            types,
                          });
                        }}
                        style={{
                          minHeight: 44,
                          paddingHorizontal: 14,
                          borderRadius: radius.pill,
                          borderWidth: 1,
                          borderColor: selected ? colors.text : colors.line,
                          backgroundColor: selected
                            ? colors.surface2
                            : "transparent",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? colors.text : colors.dim,
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {option.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}>
                Completion notifications are optional and can be managed in
                Settings › Notifications. Unselected types stay on the list
                below.
              </Text>
            </>
          ) : null}
        </Card>
      )}

      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color:
              notice.startsWith("Import failed") ||
              notice.startsWith("Couldn’t") ||
              notice.startsWith("Write access") ||
              notice.startsWith("Read access") ||
              notice.startsWith("Apple Health is not")
                ? colors.danger
                : colors.success,
            fontSize: 13,
            fontWeight: "600",
          }}
        >
          {notice}
        </Text>
      ) : null}

      {isAuthenticated ? null : (
        <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}>
          Import works on this phone now. The copy syncs to your Grayed Lift
          account after you sign in.
        </Text>
      )}

      {reviewItem && reviewItem.state.kind === "review" ? (
        <ReviewCard
          item={reviewItem}
          overlap={reviewItem.state.overlap}
          busy={busyUuid === reviewItem.uuid}
          onLink={async () => {
            setBusyUuid(reviewItem.uuid);
            try {
              await linkHealthSummary(
                reviewItem.state.kind === "review"
                  ? reviewItem.state.overlap.sessionId
                  : "",
                toImport(reviewItem),
              );
              setNotice("Linked to your existing workout");
              setReviewItem(null);
            } catch {
              setNotice("Couldn’t link that workout.");
            } finally {
              setBusyUuid(null);
            }
          }}
          onImportSeparately={async () => {
            setReviewItem(null);
            await importWorkout(reviewItem);
          }}
          onIgnore={async () => {
            await ignoreHealthUuid(reviewItem.uuid);
            setReviewItem(null);
          }}
          onClose={() => setReviewItem(null)}
        />
      ) : null}

      {queryError ? (
        <EmptyState
          icon={HeartPulse}
          title="Couldn’t load workouts"
          description={queryError}
          action={
            <Button
              label="Try again"
              variant="outline"
              onPress={() =>
                void loadHealthState(true, markHealthAuthRequested).then(
                  applyHealthState,
                )
              }
            />
          }
        />
      ) : auth === "unavailable" ? (
        <EmptyState
          icon={HeartPulse}
          title="Health is unavailable"
          description="Apple Health is not available on this device."
        />
      ) : auth === "not_requested" ? (
        <EmptyState
          icon={HeartPulse}
          title="Connect Apple Health"
          description="Permission has not been requested yet. Connect to see workouts from the last 90 days."
        />
      ) : workouts === null || lookups === undefined ? (
        <Text style={{ color: colors.dim }}>Loading workouts…</Text>
      ) : items.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title="No workouts in 90 days"
          description="No workouts available or access may be limited."
        />
      ) : (
        <View style={{ gap: 10 }}>
          <SectionTitle
            title="Workouts in the last 90 days"
            action={
              <Text style={{ color: colors.dim, fontSize: 12 }}>
                {items.length}
              </Text>
            }
          />
          {items.map((item) => (
            <HealthWorkoutRow
              key={item.uuid}
              item={item}
              unit={unit}
              busy={busyUuid === item.uuid}
              onImport={() => void importWorkout(item)}
              onOpen={(sessionId) =>
                router.push({
                  pathname: "/workout/[sessionId]",
                  params: { sessionId },
                })
              }
              onRemove={(sessionId) => removeImported(sessionId)}
              onReview={() => setReviewItem(item)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        padding: 12,
        gap: 4,
      }}
    >
      <Text style={{ color: colors.dim, fontSize: 11, fontWeight: "700" }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
        {value}
      </Text>
    </View>
  );
}

function HealthWorkoutRow({
  item,
  unit,
  busy,
  onImport,
  onOpen,
  onRemove,
  onReview,
}: {
  item: HealthListItem;
  unit: "lb" | "kg";
  busy: boolean;
  onImport: () => void;
  onOpen: (sessionId: string) => void;
  onRemove: (sessionId: string) => void;
  onReview: () => void;
}) {
  const distance = formatHealthDistance(item.distanceMeters, unit);
  const energy = formatHealthEnergy(item.energyKcal);
  const sports = formatHealthSportLine(item.segments);
  const details = [
    formatWhen(item.startedAt),
    formatDuration(item.durationSeconds * 1000),
    item.sourceName,
    sports,
    distance,
    energy,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card style={{ padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <HealthActivityIcon symbolName={item.symbolName} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
            {item.activityName}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}>
            {details}
          </Text>
        </View>
      </View>
      {item.state.kind === "imported" ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            style={{ flex: 1 }}
            size="sm"
            variant="outline"
            icon={Check}
            label="Imported"
            onPress={() =>
              onOpen(item.state.kind === "imported" ? item.state.sessionId : "")
            }
          />
          <Button
            size="sm"
            variant="ghost"
            label="Remove"
            onPress={() =>
              item.state.kind === "imported"
                ? onRemove(item.state.sessionId)
                : undefined
            }
          />
        </View>
      ) : item.state.kind === "review" ? (
        <Button
          size="sm"
          variant="outline"
          label="Review"
          disabled={busy}
          onPress={onReview}
        />
      ) : item.state.kind === "error" ? (
        <Button
          size="sm"
          variant="outline"
          label="Retry"
          disabled={busy}
          onPress={onImport}
        />
      ) : (
        <Button
          size="sm"
          label={busy ? "Importing…" : "Import"}
          disabled={busy}
          onPress={onImport}
        />
      )}
    </Card>
  );
}

function ReviewCard({
  item,
  overlap,
  busy,
  onLink,
  onImportSeparately,
  onIgnore,
  onClose,
}: {
  item: HealthListItem;
  overlap: HealthOverlapCandidate;
  busy: boolean;
  onLink: () => Promise<void>;
  onImportSeparately: () => Promise<void>;
  onIgnore: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Card>
      <SectionTitle title="Possible overlap" />
      <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
        This Apple Health strength workout is close to a workout you already
        logged in Grayed Lift. Linking keeps one weekly count.
      </Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
        Health · {item.activityName} · {formatWhen(item.startedAt)}
      </Text>
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/workout/[sessionId]",
            params: { sessionId: overlap.sessionId },
          })
        }
      >
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
          Grayed Lift · {overlap.templateName} · {formatWhen(overlap.startedAt)}
        </Text>
      </Pressable>
      <Button
        label={busy ? "Linking…" : "Link Health summary to existing session"}
        disabled={busy}
        onPress={() => void onLink()}
      />
      <Button
        label="Import separately"
        variant="outline"
        disabled={busy}
        onPress={() => void onImportSeparately()}
      />
      <Button
        label="Ignore"
        variant="ghost"
        disabled={busy}
        onPress={() => void onIgnore()}
      />
      <Button label="Close" variant="ghost" size="sm" onPress={onClose} />
    </Card>
  );
}
