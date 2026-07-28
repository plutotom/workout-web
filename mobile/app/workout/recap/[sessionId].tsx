import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Share2,
  Trophy,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";

import {
  buildMuscleSegments,
  MuscleBand,
  Sparkline,
} from "@/components/charts";
import { Button, Card, EmptyState, Metric, Screen } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/format";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

function formatVolume(value: number) {
  return `${Math.round(value).toLocaleString()} lb`;
}

function formatSet(weight: number, reps: number) {
  if (weight <= 0) return `${reps} reps`;
  return `${weight} × ${reps}`;
}

export default function WorkoutRecapScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const recap = useQuery(api.routes.workouts.queries.recap, {
    sessionId: sessionId as Id<"workoutSessions">,
  });
  const catalog = useCatalog();
  const [step, setStep] = useState(0);
  const segments = useMemo(
    () => buildMuscleSegments(recap?.muscleSets ?? [], catalog),
    [recap?.muscleSets, catalog],
  );

  if (recap === undefined)
    return (
      <Screen>
        <Text style={{ color: colors.dim }}>Loading recap…</Text>
      </Screen>
    );
  if (!recap)
    return (
      <Screen>
        <EmptyState
          title="Workout not found"
          description="This recap is unavailable."
        />
      </Screen>
    );

  const completedAt = recap.session.completedAt ?? recap.session.startedAt;
  const standout = recap.standout;
  const story = recap.progressionStory;
  const beats: Array<{
    kicker: string;
    title: string;
    body: string;
    extra?: React.ReactNode;
  }> = [
    {
      kicker: "Workout complete",
      title: recap.session.templateName,
      body: formatDate(completedAt),
      extra: (
        <Card style={{ marginTop: 20 }}>
          <Text
            style={{
              color: colors.dim,
              fontSize: 10,
              letterSpacing: 1.8,
              fontWeight: "700",
            }}
          >
            BANKED
          </Text>
          <Text style={{ color: colors.text, fontSize: 54, fontWeight: "700" }}>
            {recap.totals.completedSets}
          </Text>
          <Text style={{ color: colors.dim }}>sets completed</Text>
        </Card>
      ),
    },
    {
      kicker: "Volume moved",
      title: formatVolume(recap.totals.volume),
      body: `${formatDuration(recap.totals.durationMs)} · ${recap.totals.completedSets} sets · ${recap.totals.exerciseCount} lifts`,
      extra: (
        <Card
          style={{ flexDirection: "row", marginTop: 20, paddingHorizontal: 8 }}
        >
          <Metric
            value={formatDuration(recap.totals.durationMs)}
            label="TRAINING"
          />
          <Metric value={recap.totals.completedSets} label="SETS" />
          <Metric value={recap.totals.exerciseCount} label="LIFTS" />
        </Card>
      ),
    },
    {
      kicker: "Standout lift",
      title: standout ? catalog.name(standout.slug) : "No completed sets",
      body: standout
        ? `Best set today: ${formatSet(standout.weight, standout.reps)}`
        : "Check off sets during a workout to build records.",
      extra: standout ? (
        <Card
          style={{ marginTop: 20, flexDirection: "row", alignItems: "center" }}
        >
          {standout.isPr ? (
            <Trophy size={30} color={colors.text} />
          ) : (
            <Award size={30} color={colors.text} />
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}
            >
              {standout.isPr
                ? standout.priorBest
                  ? "New personal best"
                  : "First logged best"
                : "Strong work"}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 12, marginTop: 4 }}>
              {standout.isPr && standout.priorBest
                ? `Previous best ${formatSet(standout.priorBest.weight, standout.priorBest.reps)}`
                : standout.est1RM > 0
                  ? `Estimated 1RM ${Math.round(standout.est1RM)} lb`
                  : `${standout.reps} reps logged`}
            </Text>
          </View>
        </Card>
      ) : undefined,
    },
    {
      kicker: "Where the work went",
      title: "Muscle split",
      body: "Completed sets by primary muscle group.",
      extra: (
        <Card style={{ marginTop: 20 }}>
          <MuscleBand segments={segments} legend />
        </Card>
      ),
    },
    ...(story
      ? [
          {
            kicker: "Progression",
            title: story.isBaseline
              ? `${catalog.short(story.slug)} baseline`
              : `${catalog.short(story.slug)} ${story.vsPreviousWeight != null && story.vsPreviousWeight > 0 ? "+" : ""}${story.vsPreviousWeight ?? 0} lb`,
            body: story.isBaseline
              ? "Baseline locked in — next time you’ll see the trend."
              : story.today && story.previous
                ? `${formatSet(story.today.weight, story.today.reps)} · was ${formatSet(story.previous.weight, story.previous.reps)} last time`
                : "Your recent training trend.",
            extra: (
              <Card style={{ marginTop: 20 }}>
                <Text
                  style={{
                    color: colors.dim,
                    fontSize: 10,
                    letterSpacing: 1.5,
                  }}
                >
                  {story.scopedToTemplate
                    ? `${recap.session.templateName.toUpperCase()} · LAST ${story.points.length}`
                    : `LAST ${story.points.length} SESSIONS`}
                </Text>
                <Sparkline values={story.points.map((point) => point.weight)} />
                <Button
                  label="See full history"
                  variant="outline"
                  onPress={() =>
                    router.push({
                      pathname: "/insights/exercise/[slug]",
                      params: { slug: story.slug, days: "all" },
                    })
                  }
                />
              </Card>
            ),
          },
        ]
      : []),
    {
      kicker: "Consistency",
      title: `${recap.consistency.sessionsThisWeek}/${recap.consistency.weeklyGoal} this week`,
      body: `${recap.consistency.weekStreak} week streak`,
      extra: (
        <View style={{ flexDirection: "row", gap: 7, marginTop: 28 }}>
          {weekdays.map((label, index) => (
            <View
              key={`${label}-${index}`}
              style={{ flex: 1, gap: 7, alignItems: "center" }}
            >
              <View
                style={{
                  aspectRatio: 1,
                  width: "100%",
                  borderRadius: 9,
                  backgroundColor: recap.consistency.daysWorked[index]
                    ? colors.action
                    : colors.surface2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {recap.consistency.daysWorked[index] ? (
                  <Check size={18} color={colors.actionText} />
                ) : null}
              </View>
              <Text style={{ color: colors.dim, fontSize: 10 }}>{label}</Text>
            </View>
          ))}
        </View>
      ),
    },
    {
      kicker: "Share card",
      title: recap.session.templateName,
      body: `${formatVolume(recap.totals.volume)} · ${recap.totals.completedSets} sets · ${standout ? catalog.short(standout.slug) : "Workout complete"}`,
      extra: (
        <Card style={{ marginTop: 22 }}>
          <Text style={{ color: colors.dim, fontSize: 10, letterSpacing: 1.5 }}>
            {formatDate(completedAt).toUpperCase()}
          </Text>
          <Text style={{ color: colors.text, fontSize: 25, fontWeight: "700" }}>
            {recap.session.templateName}
          </Text>
          <View style={{ flexDirection: "row" }}>
            <Metric value={formatVolume(recap.totals.volume)} label="VOLUME" />
            <Metric value={recap.totals.completedSets} label="SETS" />
          </View>
          <MuscleBand segments={segments} />
        </Card>
      ),
    },
  ];
  const safeStep = Math.min(step, beats.length - 1);
  const beat = beats[safeStep];
  const shareMessage = `${recap.session.templateName}: ${formatVolume(recap.totals.volume)}, ${recap.totals.completedSets} sets`;

  async function share() {
    await Share.share({ message: shareMessage });
  }

  return (
    <Screen scroll={false} contentStyle={{ flex: 1 }}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {beats.map((_, index) => (
          <View
            key={index}
            style={{
              height: 4,
              borderRadius: 2,
              flex: 1,
              backgroundColor:
                index <= safeStep ? colors.text : colors.surface2,
            }}
          />
        ))}
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text
          style={{
            color: colors.dim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1.8,
            textTransform: "uppercase",
          }}
        >
          {beat.kicker}
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 38,
            lineHeight: 42,
            fontWeight: "700",
            marginTop: 12,
          }}
        >
          {beat.title}
        </Text>
        <Text
          style={{
            color: colors.dim,
            fontSize: 15,
            lineHeight: 22,
            marginTop: 12,
          }}
        >
          {beat.body}
        </Text>
        {beat.extra}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          disabled={safeStep === 0}
          onPress={() => setStep((value) => Math.max(0, value - 1))}
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            backgroundColor: colors.surface2,
            opacity: safeStep === 0 ? 0.35 : 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft color={colors.text} />
        </Pressable>
        {safeStep < beats.length - 1 ? (
          <Button
            label="Next"
            icon={ChevronRight}
            size="lg"
            style={{ flex: 1 }}
            onPress={() =>
              setStep((value) => Math.min(beats.length - 1, value + 1))
            }
          />
        ) : (
          <Button
            label="Share recap"
            icon={Share2}
            size="lg"
            style={{ flex: 1 }}
            onPress={share}
          />
        )}
      </View>
      <Button
        label="Done"
        variant="ghost"
        onPress={() => router.replace("/dashboard")}
      />
    </Screen>
  );
}
