import { Watch } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";

import { Button, Card } from "@/components/ui";
import { getHealthAdapter } from "@/health";
import {
  endWatchWorkout,
  getWatchCompanionStatus,
  startWatchWorkout,
  subscribeWatchEvents,
} from "@/health/watch-bridge";
import {
  watchLaunchErrorMessage,
  watchStartBlockedReason,
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
  const [status, setStatus] = useState(getWatchCompanionStatus);
  const [watchStatus, setWatchStatus] = useState<WatchSessionStatus>("idle");
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [energyKcal, setEnergyKcal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    return subscribeWatchEvents((event) => {
      if (event.type === "state") {
        if (event.sessionId && event.sessionId !== sessionId) return;
        setWatchStatus(event.status);
      }
      if (event.type === "metrics") {
        setHeartRate(event.heartRate);
        setEnergyKcal(event.activeEnergyKcal);
      }
      if (event.type === "ended" && event.sessionId === sessionId) {
        setWatchStatus("ended");
      }
    });
  }, [sessionId]);

  useEffect(() => {
    if (!status.paired || !status.installed || autoStarted.current) return;
    autoStarted.current = true;
    void begin();
    // Pairing/install is device state; starting once per mount is the spike path.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- session start is one-shot
  }, [sessionId, status.paired, status.installed]);

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

  if (!status.supported) return null;

  const recording = watchStatus === "recording" || watchStatus === "starting";

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
          label={busy ? "Starting…" : "Start Watch"}
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
    return "No paired Watch. This spike still builds the companion into the iPhone app.";
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
  return "Start Watch recording for this lift. Phone still owns sets.";
}
