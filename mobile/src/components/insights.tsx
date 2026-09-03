import { router } from "expo-router";
import {
  ChevronRight,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui";
import { formatDate, formatDuration } from "@/lib/format";
import { formatHealthHistoryLine } from "@/health/mapping";
import { colors } from "@/theme";
import { useCatalog } from "@/providers/catalog-provider";

export type InsightDays = 7 | 30 | 90 | null;

export const dayOptions = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: null, label: "All" },
] as const;

export function daysParam(days: InsightDays) {
  return days === null ? "all" : String(days);
}

export function parseDays(value?: string): InsightDays {
  if (value === "7") return 7;
  if (value === "90") return 90;
  if (value === "all") return null;
  return 30;
}

export function volume(value: number, unit = "lb") {
  if (value >= 1000) {
    const compact = value / 1000;
    return `${compact % 1 ? compact.toFixed(1) : compact.toFixed(0)}k ${unit}`;
  }
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

export function LiftRows({
  lifts,
  days,
}: {
  lifts: Array<{
    slug: string;
    sessionCount: number;
    bestWeight: number;
    bestReps: number;
    est1RM: number;
    trend: "up" | "flat" | "down";
  }>;
  days: InsightDays;
}) {
  const catalog = useCatalog();
  return (
    <View style={{ gap: 10 }}>
      {lifts.map((lift, index) => {
        const Trend =
          lift.trend === "up"
            ? TrendingUp
            : lift.trend === "down"
              ? TrendingDown
              : Minus;
        return (
          <Pressable
            key={lift.slug}
            onPress={() =>
              router.push({
                pathname: "/exercises/[slug]",
                params: { slug: lift.slug, days: daysParam(days) },
              })
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Card
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
              }}
            >
              <Text
                style={{
                  color: colors.faint,
                  width: 25,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {index + 1}
              </Text>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "700",
                  }}
                >
                  {catalog.name(lift.slug)}
                </Text>
                <Text style={{ color: colors.dim, fontSize: 11, marginTop: 3 }}>
                  {lift.bestWeight} lb × {lift.bestReps} · {lift.sessionCount}{" "}
                  session{lift.sessionCount === 1 ? "" : "s"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "700",
                  }}
                >
                  {Math.round(lift.est1RM)} lb
                </Text>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Trend
                    size={12}
                    color={lift.trend === "up" ? colors.success : colors.dim}
                  />
                  <Text style={{ color: colors.dim, fontSize: 10 }}>
                    EST. 1RM
                  </Text>
                </View>
              </View>
              <ChevronRight
                size={17}
                color={colors.faint}
                style={{ marginLeft: 7 }}
              />
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SessionRows({
  sessions,
}: {
  sessions: Array<{
    sessionId: string;
    templateName: string;
    completedAt: number;
    durationMs: number;
    volume: number;
    sessionKind?: "tracked" | "health_summary";
    sourceName?: string | null;
    distanceMeters?: number | null;
    energyKcal?: number | null;
    exercises: Array<{ slug: string; completedCount: number }>;
  }>;
}) {
  const catalog = useCatalog();
  return (
    <View style={{ gap: 10 }}>
      {sessions.map((session) => {
        const healthLine = formatHealthHistoryLine(session);
        return (
          <Pressable
            key={session.sessionId}
            onPress={() => router.push(`/workout/${session.sessionId}`)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Card style={{ padding: 14 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    {session.templateName}
                  </Text>
                  <Text
                    style={{ color: colors.dim, fontSize: 11, marginTop: 3 }}
                  >
                    {formatDate(session.completedAt, "short")} ·{" "}
                    {formatDuration(session.durationMs)}
                    {healthLine ? null : ` · ${volume(session.volume)}`}
                  </Text>
                </View>
                <ChevronRight size={17} color={colors.faint} />
              </View>
              <Text
                numberOfLines={2}
                style={{ color: colors.dim, fontSize: 12, lineHeight: 18 }}
              >
                {healthLine ??
                  session.exercises
                    .map(
                      (exercise) =>
                        `${catalog.short(exercise.slug)} ${exercise.completedCount}`,
                    )
                    .join(" · ")}
              </Text>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}
