import { Watch } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";

import { Button, Card } from "@/components/ui";
import { useLocalPreferences } from "@/data/local/provider";
import { getHealthAdapter } from "@/health";
import {
  endWatchWorkout,
  getWatchCompanionStatus,
  getWatchSessionSnapshot,
  refreshWatchSession,
  startWatchWorkout,
  subscribeWatchEvents,
} from "@/health/watch-bridge";
import {
  DEFAULT_AUTO_START_WATCH_WORKOUT,
  shouldAutoStartWatchWorkout,
  shouldShowWatchCompanion,
  watchCompanionPresentation,
  watchLaunchErrorMessage,
  watchStartBlockedReason,
  reduceWatchSessionStatus,
  type WatchCompanionStatus,
  type WatchSessionStatus,
} from "@/health/watch-session";
import { colors } from "@/theme";

type Props = { sessionId: string; startedAt: number };

export function WatchCompanionCard(props: Props) {
  return <WatchCompanionSession key={props.sessionId} {...props} />;
}

function WatchCompanionSession({ sessionId, startedAt }: Props) {
  const preferences = useLocalPreferences();
  const [status, setStatus] = useState(getWatchCompanionStatus);
  const [snapshot, setSnapshot] = useState(() =>
    getWatchSessionSnapshot(sessionId),
  );
  const { status: watchStatus, heartRate, energyKcal, healthUuid } = snapshot;
  const actionPending = useRef(false);
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healthAvailable, setHealthAvailable] = useState<boolean | null>(null);
  const autoStarted = useRef(false);
  const autoStartEnabled =
    preferences?.autoStartWatchWorkout ?? DEFAULT_AUTO_START_WATCH_WORKOUT;

  useEffect(() => {
    let active = true;
    void getHealthAdapter()
      .isAvailable()
      .then((value) => {
        if (active) setHealthAvailable(value);
      })
      .catch(() => {
        if (active) setHealthAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeWatchEvents((event) => {
      if (event.type !== "metrics") {
        const next = getWatchCompanionStatus();
        setStatus(
          event.type === "state"
            ? { ...next, reachable: event.reachable }
            : next,
        );
      }
      if (event.type === "metrics") {
        if (event.sessionId !== sessionId) return;
        setSnapshot((current) =>
          current.status === "ended"
            ? current
            : {
                ...current,
                heartRate: event.heartRate,
                energyKcal: event.activeEnergyKcal,
              },
        );
        return;
      }
      setSnapshot((current) => ({
        ...current,
        status: reduceWatchSessionStatus(current.status, event, sessionId),
        healthUuid:
          event.type === "ended" && event.sessionId === sessionId
            ? event.healthUuid || current.healthUuid
            : current.healthUuid,
      }));
      if (event.type === "ended" && event.sessionId === sessionId)
        setEnding(false);
      if (
        event.type === "state" &&
        event.sessionId === sessionId &&
        event.status === "recording"
      )
        setError(null);
    });
    refreshWatchSession();
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setStatus(getWatchCompanionStatus());
        refreshWatchSession();
      }
    });
    return () => {
      unsubscribe();
      foreground.remove();
    };
  }, [sessionId]);

  useEffect(() => {
    if (preferences === undefined || autoStarted.current) return;
    if (
      !["idle", "reachable"].includes(getWatchSessionSnapshot(sessionId).status)
    )
      return;
    if (healthAvailable !== true) return;
    if (
      !shouldAutoStartWatchWorkout({
        autoStartEnabled,
        status,
        healthAvailable,
      })
    ) {
      return;
    }
    autoStarted.current = true;
    void begin(startedAt);
    // Pairing/install is device state; starting once per mount is the existing path.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session start is one-shot
  }, [
    sessionId,
    status.paired,
    status.installed,
    preferences,
    autoStartEnabled,
    healthAvailable,
    watchStatus,
  ]);

  async function begin(recordingStartedAt = Date.now()) {
    if (actionPending.current) return;
    if (
      !["idle", "reachable"].includes(getWatchSessionSnapshot(sessionId).status)
    )
      return;
    actionPending.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = getWatchCompanionStatus();
      setStatus(next);
      const blocked = watchStartBlockedReason(next);
      if (blocked) throw new Error(blocked);
      const write = await getHealthAdapter().requestWriteAccess();
      if (write !== "connected" && write !== "limited") {
        throw new Error("Allow Health write access to start Watch recording.");
      }
      await startWatchWorkout({ sessionId, startedAt: recordingStartedAt });
      setSnapshot(getWatchSessionSnapshot(sessionId));
    } catch (caught) {
      setError(watchLaunchErrorMessage(caught));
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }

  async function end() {
    if (actionPending.current || ending) return;
    actionPending.current = true;
    setEnding(true);
    setError(null);
    try {
      await endWatchWorkout(sessionId);
    } catch {
      setEnding(false);
      setError(
        "Couldn’t end Watch recording. Try again or end it on your Watch.",
      );
    } finally {
      actionPending.current = false;
    }
  }

  if (healthAvailable !== true) return null;
  if (
    !shouldShowWatchCompanion({
      status,
      watchStatus,
    })
  ) {
    return null;
  }

  const recording =
    watchStatus === "recording" ||
    watchStatus === "starting" ||
    watchStatus === "disconnected";
  const presentation = watchCompanionPresentation({
    autoStartEnabled,
    watchStatus,
    hasError: Boolean(error),
  });

  if (presentation === "compact") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Start on Apple Watch"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => void begin()}
        style={({ pressed }) => [
          {
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 4,
          },
          pressed && { opacity: 0.72 },
        ]}
      >
        <Watch color={colors.text} size={18} strokeWidth={2.3} />
        <Text
          style={{
            color: colors.text,
            fontSize: 16,
            fontWeight: "600",
            flex: 1,
          }}
        >
          {busy ? "Starting Apple Watch…" : "Start on Apple Watch"}
        </Text>
      </Pressable>
    );
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Watch color={colors.text} size={18} strokeWidth={2.3} />
        <Text
          style={{
            color: colors.text,
            fontSize: 16,
            fontWeight: "700",
            flex: 1,
          }}
        >
          Apple Watch
        </Text>
      </View>
      <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
        {companionCopy({
          status,
          watchStatus,
          recording,
          saved: Boolean(healthUuid),
        })}
      </Text>
      {recording ? (
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
          {heartRate != null ? `${Math.round(heartRate)} bpm` : "HR —"}
          {" · "}
          {energyKcal != null ? `${Math.round(energyKcal)} kcal` : "kcal —"}
        </Text>
      ) : null}
      {error ? (
        <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}>
          {error}
        </Text>
      ) : null}
      {status.paired && !recording && watchStatus !== "ended" ? (
        <Button
          label={busy ? "Starting…" : "Start on Apple Watch"}
          variant="outline"
          disabled={busy}
          onPress={() => void begin()}
        />
      ) : null}
      {recording ? (
        <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 17 }}>
          Ends Watch recording. Your workout stays open on iPhone.
        </Text>
      ) : null}
      {recording ? (
        <Button
          label={ending ? "Ending on Watch…" : "End on Watch"}
          disabled={ending || busy}
          variant="outline"
          onPress={() => void end()}
        />
      ) : null}
    </Card>
  );
}

function companionCopy({
  status,
  watchStatus,
  recording,
  saved,
}: {
  status: WatchCompanionStatus;
  watchStatus: WatchSessionStatus;
  recording: boolean;
  saved: boolean;
}) {
  if (recording && (!status.reachable || watchStatus === "disconnected")) {
    return "Watch disconnected. Recording can continue on the Watch. An end request will be delivered when it reconnects.";
  }
  const blocked = watchStartBlockedReason(status);
  if (blocked) return blocked;
  if (watchStatus === "starting") return "Starting Watch recording…";
  if (recording) return "Recording heart rate and active energy on Watch.";
  if (watchStatus === "ended") {
    return saved
      ? "Watch saved one Health workout for this session."
      : "Watch recording ended.";
  }
  if (watchStatus === "disconnected") {
    return "Watch disconnected. Recording can continue on the Watch.";
  }
  return "Start Watch recording for this workout.";
}
