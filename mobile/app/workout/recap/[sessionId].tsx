import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
import * as Sharing from "expo-sharing";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowRight,
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Share2,
  Trophy,
} from "lucide-react-native";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import { useMobileAuth } from "@/auth/auth-provider";
import { buildMuscleSegments, MuscleBand } from "@/components/charts";
import { Button, Card, EmptyState, Screen } from "@/components/ui";
import type {
  RecapProgressionStory,
  WorkoutRecap,
} from "@/data/local/insights";
import { useLocalWorkoutRecap } from "@/data/local/use-local-insights";
import { formatDate, formatDuration } from "@/lib/format";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius, space } from "@/theme";

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

function formatVolume(value: number) {
  return `${Math.round(value).toLocaleString()} lb`;
}

function formatSet(weight: number, reps: number) {
  if (weight <= 0) return `${reps} reps`;
  return `${weight}×${reps}`;
}

function formatShortDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        color: colors.dim,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.6,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface2,
        padding: space.md,
      }}
    >
      <Text style={{ color: colors.dim, fontSize: 11 }}>{label}</Text>
      <Text
        style={{
          color: colors.text,
          fontSize: 17,
          fontWeight: "700",
          marginTop: 4,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Web's `progressionCopy`: the headline and body for the progression beat. */
function progressionCopy(story: RecapProgressionStory, shortName: string) {
  if (story.isBaseline || !story.today) {
    return {
      title: `${shortName} baseline`,
      body: "Baseline locked in — next time you’ll see the trend.",
    };
  }

  const delta = story.vsPreviousWeight ?? 0;
  const todayLabel = formatSet(story.today.weight, story.today.reps);
  const previousLabel = story.previous
    ? formatSet(story.previous.weight, story.previous.reps)
    : null;
  const repDelta = story.previous ? story.today.reps - story.previous.reps : 0;
  const trailer = (fallback: string) =>
    previousLabel ? `${todayLabel} · was ${previousLabel} last time` : fallback;

  if (delta > 0)
    return {
      title: `${shortName} +${delta} lb`,
      body: trailer(`${todayLabel} · stronger than last time`),
    };
  if (delta < 0)
    return {
      title: `${shortName} ${delta} lb`,
      body: trailer(`${todayLabel} · down from last time`),
    };
  if (repDelta > 0)
    return {
      title: `${shortName} +${repDelta} reps`,
      body: trailer(`${todayLabel} · more reps at the same weight`),
    };
  if (repDelta < 0)
    return {
      title: `${shortName} ${repDelta} reps`,
      body: trailer(`${todayLabel} · fewer reps at the same weight`),
    };
  return {
    title: `${shortName} holding`,
    body: trailer(`${todayLabel} · holding steady`),
  };
}

/** Weight across the lineage. Same 300×110 geometry as the web chart. */
function ProgressionChart({
  points,
}: {
  points: RecapProgressionStory["points"];
}) {
  const values = points.map((point) => point.weight);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(1, max - min);
  const x = (index: number) =>
    points.length === 1 ? 292 : 8 + (index / (points.length - 1)) * 284;
  const y = (weight: number) => 92 - ((weight - min) / range) * 72;
  const path =
    points.length === 1
      ? "M 8 92 L 292 92"
      : points
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.weight).toFixed(1)}`,
          )
          .join(" ");

  return (
    <View style={{ height: 120 }}>
      <Svg width="100%" height="100%" viewBox="0 0 300 110">
        <Path
          d="M 8 94 L 292 94"
          stroke={colors.line}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <Path
          d={path}
          fill="none"
          stroke={colors.action}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <Circle
            key={`${point.completedAt}-${index}`}
            cx={x(index)}
            cy={y(point.weight)}
            r={index === points.length - 1 ? 6 : 3}
            fill={colors.action}
          />
        ))}
      </Svg>
    </View>
  );
}

function ProgressionStoryCard({
  story,
  templateName,
}: {
  story: RecapProgressionStory;
  templateName: string;
}) {
  const delta = story.vsPreviousWeight;
  const repDelta =
    story.today && story.previous
      ? story.today.reps - story.previous.reps
      : null;
  const deltaLabel =
    delta === null
      ? null
      : delta > 0
        ? `↑ ${delta} lb`
        : delta < 0
          ? `↓ ${Math.abs(delta)} lb`
          : (repDelta ?? 0) > 0
            ? `↑ ${repDelta} reps`
            : (repDelta ?? 0) < 0
              ? `↓ ${Math.abs(repDelta ?? 0)} reps`
              : "→ flat";

  return (
    <View style={{ marginTop: space.xl, gap: space.sm }}>
      {story.isBaseline ? (
        <Card>
          <Kicker>First mark</Kicker>
          <Text
            style={{
              color: colors.text,
              fontSize: 30,
              fontWeight: "700",
              marginTop: space.sm,
            }}
          >
            {story.today
              ? formatSet(story.today.weight, story.today.reps)
              : "—"}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 13, marginTop: 6 }}>
            Baseline locked in. Come back after your next session for the
            comparison.
          </Text>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Card style={{ flex: 1 }}>
              <Kicker>Today</Kicker>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 22,
                  fontWeight: "700",
                  marginTop: 6,
                }}
              >
                {story.today
                  ? formatSet(story.today.weight, story.today.reps)
                  : "—"}
              </Text>
              <Text style={{ color: colors.dim, fontSize: 11, marginTop: 3 }}>
                best set
              </Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Kicker>Last time</Kicker>
              <Text
                style={{
                  color: colors.text,
                  fontSize: 22,
                  fontWeight: "700",
                  marginTop: 6,
                }}
              >
                {story.previous
                  ? formatSet(story.previous.weight, story.previous.reps)
                  : "—"}
              </Text>
              <Text style={{ color: colors.dim, fontSize: 11, marginTop: 3 }}>
                {story.previous
                  ? formatShortDate(story.previous.completedAt)
                  : "—"}
              </Text>
            </Card>
          </View>

          <Card>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: space.md,
                marginBottom: space.md,
              }}
            >
              <Kicker>
                {story.scopedToTemplate
                  ? `${templateName} · last ${story.points.length}`
                  : `Last ${story.points.length} sessions`}
              </Kicker>
              {deltaLabel ? (
                <Text
                  style={{
                    color:
                      (delta ?? 0) < 0 || ((delta ?? 0) === 0 && !repDelta)
                        ? colors.dim
                        : colors.text,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {deltaLabel}
                </Text>
              ) : null}
            </View>
            <ProgressionChart points={story.points} />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 4,
              }}
            >
              <Text style={{ color: colors.dim, fontSize: 11 }}>
                {story.points[0]
                  ? formatShortDate(story.points[0].completedAt)
                  : ""}
              </Text>
              <Text style={{ color: colors.dim, fontSize: 11 }}>Today</Text>
            </View>
          </Card>
        </>
      )}

      <Button
        label="See full history"
        variant="outline"
        icon={ArrowRight}
        onPress={() =>
          router.push({
            pathname: "/insights/exercise/[slug]",
            params: { slug: story.slug, days: "all" },
          })
        }
      />
    </View>
  );
}

function WeekGrid({ daysWorked }: { daysWorked: boolean[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 7, marginTop: space.xxl }}>
      {WEEKDAY_LABELS.map((label, index) => {
        const worked = daysWorked[index] === true;
        return (
          <View
            key={`${label}-${index}`}
            style={{ flex: 1, gap: 7, alignItems: "center" }}
          >
            <View
              accessibilityLabel={
                worked ? `${label}: workout logged` : `${label}: no workout`
              }
              style={{
                aspectRatio: 1,
                width: "100%",
                borderRadius: radius.sm,
                backgroundColor: worked ? colors.action : colors.surface2,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {worked ? <Check size={18} color={colors.actionText} /> : null}
            </View>
            <Text style={{ color: colors.dim, fontSize: 10 }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Web's `standoutCallout`: how today's best set sits against the all-time best. */
function standoutCallout(
  standout: NonNullable<WorkoutRecap["standout"]>,
  shortName: string,
) {
  const { isPr, priorBest, weight, reps } = standout;
  if (isPr) {
    return {
      title: priorBest ? "New personal best" : "First logged best",
      detail: priorBest
        ? `Beat your previous ${shortName} best of ${formatSet(priorBest.weight, priorBest.reps)}`
        : `First time logging ${shortName} — this sets the bar`,
    };
  }
  if (!priorBest) return null;
  const matched = priorBest.weight === weight && priorBest.reps === reps;
  const underByWeight = priorBest.weight - weight;
  return {
    title: matched
      ? "Matched your best"
      : underByWeight > 0
        ? `${underByWeight} lb under your best`
        : `${priorBest.reps - reps} reps under your best`,
    detail: `Your all-time ${shortName} best is ${formatSet(priorBest.weight, priorBest.reps)}`,
  };
}

/**
 * Local-first, with a server fallback for workouts logged on the web, which
 * never reach SQLite. `undefined` while loading, `null` when unavailable.
 */
function useWorkoutRecap(sessionId: string) {
  const local = useLocalWorkoutRecap(sessionId);
  const { isAuthenticated } = useMobileAuth();
  const remote = useQuery(
    api.routes.workouts.queries.recap,
    local === null && isAuthenticated
      ? { sessionId: sessionId as Id<"workoutSessions"> }
      : "skip",
  );

  if (local !== null) return local;
  if (!isAuthenticated) return null;
  if (!remote) return remote;
  // The server returns the whole session document; the screen only needs its
  // header fields.
  return {
    ...remote,
    session: {
      templateName: remote.session.templateName,
      startedAt: remote.session.startedAt,
      completedAt: remote.session.completedAt ?? remote.session.startedAt,
    },
    consistency: {
      ...remote.consistency,
      daysWorked: [...remote.consistency.daysWorked],
    },
  } satisfies WorkoutRecap;
}

export default function WorkoutRecapScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const recap = useWorkoutRecap(sessionId);
  const catalog = useCatalog();
  const [step, setStep] = useState(0);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);
  const segments = useMemo(
    () => buildMuscleSegments(recap?.muscleSets ?? [], catalog),
    [recap?.muscleSets, catalog],
  );

  async function shareRecapCard() {
    if (sharing) return;
    setSharing(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          "Sharing unavailable",
          "Can't open the share sheet on this device.",
        );
        return;
      }
      if (!shareCardRef.current) {
        Alert.alert("Couldn't share", "The share card isn't ready yet.");
        return;
      }
      // PNG via file URI — avoids RN Share.share({ message }) handing iOS a
      // binary plist blob that looks like garbage in Messages / Notes.
      const uri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: "Share recap",
      });
    } catch {
      Alert.alert("Couldn't share", "Try again in a moment.");
    } finally {
      setSharing(false);
    }
  }

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
          action={
            <Button
              label="Back to dashboard"
              onPress={() => router.replace("/dashboard")}
            />
          }
        />
      </Screen>
    );

  const { completedAt, templateName } = recap.session;
  const { standout, progressionStory: story } = recap;
  const standoutShort = standout ? catalog.short(standout.slug) : "Progress";
  const callout = standout ? standoutCallout(standout, standoutShort) : null;
  const progressionBeat = story ? progressionCopy(story, standoutShort) : null;

  const beats: Array<{
    kicker: string;
    title: string;
    body: string;
    extra?: ReactNode;
  }> = [
    {
      kicker: "Workout complete",
      title: templateName,
      body: formatDate(completedAt),
      extra: (
        <Card style={{ marginTop: space.xxl }}>
          <Kicker>Banked</Kicker>
          <Text style={{ color: colors.text, fontSize: 52, fontWeight: "700" }}>
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
        <View
          style={{ flexDirection: "row", gap: space.sm, marginTop: space.xl }}
        >
          <Stat
            label="Minutes"
            value={formatDuration(recap.totals.durationMs)}
          />
          <Stat label="Sets" value={String(recap.totals.completedSets)} />
          <Stat label="Lifts" value={String(recap.totals.exerciseCount)} />
        </View>
      ),
    },
    {
      kicker: "Standout lift",
      title: standout ? catalog.name(standout.slug) : "No completed sets",
      body: standout
        ? `Best set today: ${formatSet(standout.weight, standout.reps)}`
        : "Check off sets during a workout to build records.",
      extra:
        standout && callout ? (
          <Card
            style={{
              marginTop: space.xl,
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
            }}
          >
            {standout.isPr ? (
              <Trophy size={28} color={colors.text} />
            ) : (
              <Award size={28} color={colors.text} />
            )}
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}
              >
                {callout.title}
              </Text>
              <Text
                style={{
                  color: colors.dim,
                  fontSize: 13,
                  lineHeight: 18,
                  marginTop: 4,
                }}
              >
                {callout.detail}
              </Text>
            </View>
          </Card>
        ) : undefined,
    },
    {
      kicker: "Where the work went",
      title: "Muscle split",
      body: "Sets by primary muscle group.",
      extra: (
        <View style={{ marginTop: space.xl }}>
          <MuscleBand segments={segments} legend />
        </View>
      ),
    },
    ...(story && progressionBeat
      ? [
          {
            kicker: "Progression",
            title: progressionBeat.title,
            body: progressionBeat.body,
            extra: (
              <ProgressionStoryCard story={story} templateName={templateName} />
            ),
          },
        ]
      : []),
    {
      kicker: "Consistency",
      title: `${recap.consistency.sessionsThisWeek}/${recap.consistency.weeklyGoal} this week`,
      body: `${recap.consistency.weekStreak} week streak`,
      extra: <WeekGrid daysWorked={recap.consistency.daysWorked} />,
    },
    {
      kicker: "Share card",
      title: templateName,
      body: `${formatVolume(recap.totals.volume)} · ${recap.totals.completedSets} sets · ${standoutShort}`,
      extra: (
        <View style={{ marginTop: space.xl }}>
          {/*
            Solid padded wrapper so the PNG has a clean edge and isn't a
            transparent crop of the screen chrome. collapsable={false} keeps
            Android from optimizing the node away before capture.
          */}
          <View
            ref={shareCardRef}
            collapsable={false}
            style={{
              backgroundColor: colors.bg,
              borderRadius: radius.lg,
              overflow: "hidden",
              padding: space.md,
            }}
          >
            <Card style={{ gap: space.lg }}>
              <View>
                <Kicker>{formatDate(completedAt)}</Kicker>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 24,
                    fontWeight: "700",
                    marginTop: 6,
                  }}
                >
                  {templateName}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: space.md }}>
                <Stat
                  label="Volume"
                  value={formatVolume(recap.totals.volume)}
                />
                <Stat label="Sets" value={String(recap.totals.completedSets)} />
              </View>
              <MuscleBand segments={segments} legend />
              <Text
                style={{
                  color: colors.faint,
                  fontSize: 11,
                  fontWeight: "600",
                  letterSpacing: 1.2,
                  textAlign: "center",
                  textTransform: "uppercase",
                }}
              >
                Workout
              </Text>
            </Card>
          </View>
        </View>
      ),
    },
  ];

  const safeStep = Math.min(step, beats.length - 1);
  const beat = beats[safeStep];
  const isLast = safeStep === beats.length - 1;

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
        <Kicker>{beat.kicker}</Kicker>
        <Text
          style={{
            color: colors.text,
            fontSize: 36,
            lineHeight: 41,
            fontWeight: "700",
            marginTop: space.md,
          }}
        >
          {beat.title}
        </Text>
        {beat.body ? (
          <Text
            style={{
              color: colors.dim,
              fontSize: 15,
              lineHeight: 22,
              marginTop: space.md,
            }}
          >
            {beat.body}
          </Text>
        ) : null}
        {beat.extra}
      </View>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Pressable
          accessibilityLabel="Previous"
          disabled={safeStep === 0}
          onPress={() => setStep((value) => Math.max(0, value - 1))}
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.md,
            backgroundColor: colors.surface2,
            opacity: safeStep === 0 ? 0.35 : 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ChevronLeft color={colors.text} />
        </Pressable>
        {isLast ? (
          <Button
            label={sharing ? "Sharing…" : "Share recap"}
            icon={Share2}
            size="lg"
            style={{ flex: 1 }}
            disabled={sharing}
            onPress={() => void shareRecapCard()}
          />
        ) : (
          <Button
            label="Next"
            icon={ChevronRight}
            size="lg"
            style={{ flex: 1 }}
            onPress={() =>
              setStep((value) => Math.min(beats.length - 1, value + 1))
            }
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
