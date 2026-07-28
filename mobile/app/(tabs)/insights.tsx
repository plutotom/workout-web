import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import {
  ChevronRight,
  Dumbbell,
  History,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useMobileAuth } from "@/auth/auth-provider";
import {
  buildMuscleSegments,
  MuscleBand,
  Sparkline,
} from "@/components/charts";
import {
  Button,
  Card,
  EmptyState,
  Metric,
  Screen,
  SectionTitle,
  Segmented,
} from "@/components/ui";
import {
  useLocalInsightsLifts,
  useMergedInsightsOverview,
  useMergedInsightsSessions,
} from "@/data/local/use-local-insights";
import { useCatalog } from "@/providers/catalog-provider";
import { colors } from "@/theme";

type Range = "7" | "30" | "90" | "all";
type Section = "overview" | "lifts" | "sessions";
const rangeOptions = [
  { value: "7", label: "7D" },
  { value: "30", label: "30D" },
  { value: "90", label: "90D" },
  { value: "all", label: "All" },
] as const;
const sectionOptions = [
  { value: "overview", label: "Overview" },
  { value: "lifts", label: "Lifts" },
  { value: "sessions", label: "Sessions" },
] as const;
const rangeArg = (range: Range): 7 | 30 | 90 | null =>
  range === "all" ? null : (Number(range) as 7 | 30 | 90);

function volume(value: number) {
  return `${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)} lb`;
}

function LiftRow({
  lift,
}: {
  lift: {
    slug: string;
    sessionCount: number;
    bestWeight: number;
    est1RM: number;
    trend: "up" | "flat" | "down";
  };
}) {
  const catalog = useCatalog();
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/insights/exercise/[slug]",
          params: { slug: lift.slug },
        })
      }
    >
      <Card style={{ flexDirection: "row", alignItems: "center", padding: 14 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
            numberOfLines={1}
          >
            {catalog.name(lift.slug)}
          </Text>
          <Text style={{ color: colors.dim, fontSize: 11, marginTop: 4 }}>
            {lift.sessionCount} sessions · est. 1RM {lift.est1RM} lb
          </Text>
        </View>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>
          {lift.bestWeight} lb
        </Text>
        {lift.trend === "up" ? (
          <TrendingUp color={colors.success} size={17} />
        ) : lift.trend === "down" ? (
          <TrendingDown color={colors.dim} size={17} />
        ) : (
          <ChevronRight color={colors.faint} size={17} />
        )}
      </Card>
    </Pressable>
  );
}

function SessionRow({
  session,
}: {
  session: {
    sessionId: string;
    templateName: string;
    completedAt: number;
    durationMs: number;
    volume: number;
    exercises: { slug: string; completedCount: number }[];
  };
}) {
  const catalog = useCatalog();
  const summary =
    session.exercises
      .filter((item) => item.completedCount > 0)
      .map((item) => `${catalog.short(item.slug)} ${item.completedCount}`)
      .join(" · ") || "No completed sets";
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/workout/[sessionId]",
          params: { sessionId: session.sessionId },
        })
      }
    >
      <Card style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
            >
              {session.templateName}
            </Text>
            <Text style={{ color: colors.dim, fontSize: 11, marginTop: 4 }}>
              {new Date(session.completedAt).toLocaleDateString()} ·{" "}
              {Math.max(1, Math.round(session.durationMs / 60_000))} min
            </Text>
          </View>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {volume(session.volume)}
          </Text>
          <ChevronRight color={colors.faint} size={17} />
        </View>
        <Text style={{ color: colors.dim, fontSize: 11 }} numberOfLines={2}>
          {summary}
        </Text>
      </Card>
    </Pressable>
  );
}

export default function InsightsScreen() {
  const { isAuthenticated } = useMobileAuth();
  const [range, setRange] = useState<Range>("30");
  const [section, setSection] = useState<Section>("overview");
  const days = rangeArg(range);
  const remoteSessionHistory = useQuery(
    api.routes.insights.queries.sessionHistory,
    isAuthenticated ? { days } : "skip",
  );
  const remoteLifts = useQuery(
    api.routes.insights.queries.lifts,
    isAuthenticated && section === "lifts" ? { days } : "skip",
  );
  const localLifts = useLocalInsightsLifts(days);
  const overview = useMergedInsightsOverview(
    days,
    isAuthenticated ? remoteSessionHistory : undefined,
  );
  const lifts = isAuthenticated
    ? remoteLifts
    : section === "lifts"
      ? localLifts
      : undefined;
  const sessions = useMergedInsightsSessions(
    days,
    isAuthenticated ? remoteSessionHistory : undefined,
  );
  const catalog = useCatalog();
  const muscles = useMemo(
    () => (overview ? buildMuscleSegments(overview.setsBySlug, catalog) : []),
    [catalog, overview],
  );

  return (
    <Screen>
      <View>
        <Text
          style={{
            color: colors.dim,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 2,
          }}
        >
          INSIGHTS
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 34,
            fontWeight: "700",
            letterSpacing: -1,
            marginTop: 7,
          }}
        >
          {overview ? volume(overview.stats.totalVolume) : "Loading"}
        </Text>
        <Text style={{ color: colors.dim, fontSize: 13, marginTop: 5 }}>
          {overview?.topLifts[0]
            ? `Top lift · ${catalog.short(overview.topLifts[0].slug)} ${overview.topLifts[0].bestWeight} lb`
            : "Your training signal will collect here."}
        </Text>
      </View>
      <Segmented value={range} options={rangeOptions} onChange={setRange} />
      <Segmented
        value={section}
        options={sectionOptions}
        onChange={setSection}
      />

      {section === "overview" ? (
        overview === undefined ? (
          <Text style={{ color: colors.dim }}>Loading…</Text>
        ) : overview.stats.workoutCount === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No insights yet"
            description="Complete a few workouts and your stats will show up here."
          />
        ) : (
          <>
            <Card style={{ flexDirection: "row" }}>
              <Metric value={overview.stats.workoutCount} label="Workouts" />
              <Metric
                value={`${Math.round(overview.stats.totalDurationMs / 60_000)}m`}
                label="Duration"
              />
              <Metric value={overview.stats.weekStreak} label="Week streak" />
            </Card>
            <Card>
              <SectionTitle title="Volume trend" />
              <Sparkline
                values={overview.volumeTrend.map((point) => point.volume)}
              />
            </Card>
            <Card>
              <SectionTitle title="Sets by muscle group" />
              <MuscleBand segments={muscles} legend />
            </Card>
            <View style={{ gap: 10 }}>
              <SectionTitle
                title="Top lifts"
                action={
                  <Button
                    label="See all"
                    size="sm"
                    variant="ghost"
                    onPress={() => setSection("lifts")}
                  />
                }
              />
              {overview.topLifts.slice(0, 4).map((lift) => (
                <LiftRow key={lift.slug} lift={lift} />
              ))}
            </View>
            <View style={{ gap: 10 }}>
              <SectionTitle
                title="Recent sessions"
                action={
                  <Button
                    label="View all"
                    size="sm"
                    variant="ghost"
                    onPress={() => setSection("sessions")}
                  />
                }
              />
              {overview.recentSessions.slice(0, 4).map((session) => (
                <SessionRow key={session.sessionId} session={session} />
              ))}
            </View>
          </>
        )
      ) : null}

      {section === "lifts" ? (
        lifts === undefined ? (
          <Text style={{ color: colors.dim }}>Loading…</Text>
        ) : lifts.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No lifts in this period"
            description="Complete weighted sets to see lift rankings here."
          />
        ) : (
          <View style={{ gap: 10 }}>
            {lifts.map((lift) => (
              <LiftRow key={lift.slug} lift={lift} />
            ))}
          </View>
        )
      ) : null}

      {section === "sessions" ? (
        sessions === undefined ? (
          <Text style={{ color: colors.dim }}>Loading…</Text>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={History}
            title="No workouts in this period"
            description="Finished workouts will show up here."
          />
        ) : (
          <View style={{ gap: 10 }}>
            {sessions.map((session) => (
              <SessionRow key={session.sessionId} session={session} />
            ))}
          </View>
        )
      ) : null}
    </Screen>
  );
}
