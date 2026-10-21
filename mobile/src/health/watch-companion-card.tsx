import { Watch } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button, Card } from "@/components/ui";
import { useLocalPreferences } from "@/data/local/provider";
import { getHealthAdapter } from "@/health";
import {
  endWatchWorkout,
  getWatchCompanionStatus,
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

export function WatchCompanionCard({
  sessionId,
  startedAt,
}: {
  sessionId: string;
  startedAt: number;
}) {
  const preferences = useLocalPreferences();
  const [status, setStatus] = useState(getWatchCompanionStatus);
  const [watchStatus, setWatchStatus] = useState<WatchSessionStatus>("idle");
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [energyKcal, setEnergyKcal] = useState<number | null>(null);
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
    return subscribeWatchEvents((event) => {
      if (event.type === "metrics") {
        setHeartRate(event.heartRate);
        setEnergyKcal(event.activeEnergyKcal);
        return;
      }
      setWatchStatus((current) =>
        reduceWatchSessionStatus(current, event, sessionId),
      );
    });
  }, [sessionId]);

  useEffect(() => {
    if (preferences === undefined || autoStarted.current) return;
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
    void begin();
    // Pairing/install is device state; starting once per mount is the existing path.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session start is one-shot
  }, [
    sessionId,
    status.paired,
    status.installed,
    preferences,
    autoStartEnabled,
    healthAvailable,
  ]);

  async function begin() {
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
      await startWatchWorkout({ sessionId, startedAt });
      setWatchStatus("starting");
    } catch (caught) {
      setError(watchLaunchErrorMessage(caught));
    } finally {
      setBusy(false);
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

  const recording = watchStatus === "recording" || watchStatus === "starting";
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
        {companionCopy({ status, watchStatus, recording })}
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
        <Button
          label="End on Watch"
          variant="outline"
          onPress={() => void endWatchWorkout()}
        />
      ) : null}
    </Card>
  );
}

function companionCopy({
  status,
  watchStatus,
  recording,
}: {
  status: WatchCompanionStatus;
  watchStatus: WatchSessionStatus;
  recording: boolean;
}) {
  if (!status.paired) {
    return "Watch recording is running for this workout.";
  }
  const blocked = watchStartBlockedReason(status);
  if (blocked) return blocked;
  if (recording) return "Recording heart rate and active energy on Watch.";
  if (watchStatus === "ended") {
    return "Watch saved one Health workout for this session.";
  }
  if (watchStatus === "disconnected") {
    return "Watch disconnected. Recording can continue on the Watch.";
  }
  return "Start Watch recording for this workout.";
}
