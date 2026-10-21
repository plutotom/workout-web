import { Watch } from "lucide-react-native";
import { useState } from "react";
import { Alert, Platform, Switch, Text, View } from "react-native";

import { Card, SectionTitle } from "@/components/ui";
import { useLocalData, useLocalPreferences } from "@/data/local/provider";
import { getWatchCompanionStatus } from "@/health/watch-bridge";
import { DEFAULT_AUTO_START_WATCH_WORKOUT } from "@/health/watch-session";
import { colors } from "@/theme";

export function WatchSettingsCard() {
  const preferences = useLocalPreferences();
  const { setWatchPreferences } = useLocalData();
  const [busy, setBusy] = useState(false);

  if (Platform.OS !== "ios") return null;

  const autoStart =
    preferences?.autoStartWatchWorkout ?? DEFAULT_AUTO_START_WATCH_WORKOUT;
  const watch = getWatchCompanionStatus();

  async function persist(next: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await setWatchPreferences({ autoStartWatchWorkout: next });
    } catch {
      Alert.alert("Couldn’t save Watch setting", "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Watch color={colors.text} size={22} strokeWidth={2.3} />
      <SectionTitle title="Apple Watch" />
      <View style={{ gap: 7 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              fontWeight: "600",
              flex: 1,
            }}
          >
            Auto-start Apple Watch workout
          </Text>
          <Switch
            accessibilityLabel="Auto-start Apple Watch workout"
            value={autoStart}
            disabled={busy || preferences === undefined}
            onValueChange={(next) => {
              void persist(next);
            }}
          />
        </View>
        <Text style={{ color: colors.dim, fontSize: 13, lineHeight: 19 }}>
          When on, starting a lift also starts the Watch workout for heart rate,
          calories, and rings. Turn this off if you already track the Watch
          workout in another app. You can still start it from the active workout
          screen.
        </Text>
        <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 17 }}>
          This controls Watch recording. Saving workouts from iPhone to Apple
          Health is a separate setting.
        </Text>
        {!watch.supported || !watch.paired ? (
          <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 17 }}>
            {watch.supported
              ? "No paired Apple Watch on this iPhone."
              : "Watch recording is not available in this build."}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
