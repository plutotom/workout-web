import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { Text, View } from "react-native";

import { Button, Card, PageHeader, Screen } from "@/components/ui";
import { NoteWorkoutBody } from "@/components/workout/note-workout-body";
import { useNoteWorkoutRefresh } from "@/components/workout/use-note-workout-refresh";
import { useMobileAuth } from "@/auth/auth-provider";
import { useLocalData, useLocalWorkout } from "@/data/local/provider";
import type { WorkoutRecap } from "@/data/local/insights";
import { formatHealthDistance, formatHealthEnergy } from "@/health/mapping";
import { formatDate, formatDuration } from "@/lib/format";
import { colors } from "@/theme";

export function NoteWorkoutRecap({
  sessionId,
  recap,
  unit,
}: {
  sessionId: string;
  recap: WorkoutRecap;
  unit: "lb" | "kg";
}) {
  const local = useLocalWorkout(sessionId);
  const { isAuthenticated } = useMobileAuth();
  const { adoptRemoteNoteWorkout } = useLocalData();
  const remoteSessionId = local === null ? sessionId : local?.remoteId;
  const remote = useQuery(
    api.routes.workouts.queries.get,
    remoteSessionId && isAuthenticated
      ? { sessionId: remoteSessionId as Id<"workoutSessions"> }
      : "skip",
  );
  useNoteWorkoutRefresh(local, remote);

  async function prepareEdit() {
    if (remote?.status === "completed" && remote.inputMode === "note") {
      return adoptRemoteNoteWorkout(remote);
    }
    if (local) return local._id;
    if (!remote)
      throw new Error("Your workout is still loading. Try again in a moment.");
    return adoptRemoteNoteWorkout(remote);
  }
  const healthFacts = [
    formatHealthDistance(recap.session.distanceMeters, unit),
    formatHealthEnergy(recap.session.energyKcal),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Screen>
      <PageHeader
        title="Workout complete"
        eyebrow="Note workout"
        subtitle={formatDate(recap.session.completedAt)}
      />
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: `${colors.success}1A`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={23} color={colors.success} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>
            {formatDuration(recap.totals.durationMs)}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 13 }}>
            {[recap.session.placeName, healthFacts]
              .filter(Boolean)
              .join(" · ") || "Workout saved"}
          </Text>
        </View>
      </Card>
      <NoteWorkoutBody
        sessionId={sessionId}
        noteBody={recap.session.noteBody}
        noteUnit={recap.session.noteUnit}
        prepareEdit={prepareEdit}
      />
      <Card>
        <Text
          style={{
            color: colors.dim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.5,
          }}
        >
          CONSISTENCY
        </Text>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>
          {recap.consistency.sessionsThisWeek}/{recap.consistency.weeklyGoal}{" "}
          this week
        </Text>
        <Text style={{ color: colors.dim, fontSize: 13 }}>
          {recap.consistency.weekStreak} week streak
        </Text>
        <Text style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}>
          This note counts toward your workout attendance. Exercise and weight
          stats come from logged sets.
        </Text>
      </Card>
      <Button
        label="Done"
        size="lg"
        onPress={() => router.replace("/dashboard")}
      />
    </Screen>
  );
}
