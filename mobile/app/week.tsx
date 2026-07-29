import { useEffect, useMemo, useState } from "react";
import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { router } from "expo-router";
import { Check, ChevronRight, History, Moon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { useMobileAuth } from "@/auth/auth-provider";
import {
  buildMuscleSegments,
  MuscleBand,
  ProgressRing,
  Sparkline,
  type MuscleSegment,
} from "@/components/charts";
import { volume } from "@/components/insights";
import { Button, Card, EmptyState, PageHeader, Screen } from "@/components/ui";
import {
  useMergedInsightsOverview,
  useMergedInsightsSessions,
} from "@/data/local/use-local-insights";
import { formatDuration } from "@/lib/format";
import { useCatalog } from "@/providers/catalog-provider";
import { colors, radius } from "@/theme";

const WEEKLY_GOAL = 4;
const ROLLING_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type WeekSession = {
  id: string;
  name: string;
  completedAt: number;
  durationMs: number;
  volume: number;
  summary: string;
  segments: MuscleSegment[];
};

type WeekDay = {
  key: string;
  dayStart: number;
  weekday: string;
  dateLabel: string;
  isToday: boolean;
  volume: number;
  sessions: WeekSession[];
};

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatMomentum(current: number, prior: number) {
  if (prior <= 0) {
    return current > 0 ? "New" : "0%";
  }
  const pct = Math.round(((current - prior) / prior) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function buildRollingDays(
  sessions: WeekSession[],
  now = Date.now(),
): WeekDay[] {
  const todayStart = startOfLocalDay(now);
  const oldestStart = todayStart - (ROLLING_DAYS - 1) * MS_PER_DAY;
  const byDay = new Map<number, WeekSession[]>();

  for (const session of sessions) {
    const day = Math.max(oldestStart, startOfLocalDay(session.completedAt));
    const bucket = byDay.get(day);
    if (bucket) bucket.push(session);
    else byDay.set(day, [session]);
  }

  const days: WeekDay[] = [];
  for (let offset = ROLLING_DAYS - 1; offset >= 0; offset -= 1) {
    const dayStart = todayStart - offset * MS_PER_DAY;
    const daySessions = (byDay.get(dayStart) ?? []).sort(
      (a, b) => b.completedAt - a.completedAt,
    );
    const date = new Date(dayStart);
    days.push({
      key: String(dayStart),
      dayStart,
      weekday: date.toLocaleDateString(undefined, { weekday: "short" }),
      dateLabel: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      isToday: dayStart === todayStart,
      volume: daySessions.reduce((sum, s) => sum + s.volume, 0),
      sessions: daySessions,
    });
  }
  return days;
}

/** Matches web `animate-rise-in`: 10px up + fade, 420ms ease-out. */
function riseIn(delayMs = 0) {
  return FadeInDown.duration(420)
    .delay(delayMs)
    .easing(Easing.out(Easing.ease))
    .withInitialValues({
      opacity: 0,
      transform: [{ translateY: 10 }],
    });
}

function DayVolumeBar({
  height,
  worked,
  delayMs,
  selected,
}: {
  height: number;
  worked: boolean;
  delayMs: number;
  selected: boolean;
}) {
  const barHeight = useSharedValue(0);
  const ring = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    barHeight.value = 0;
    barHeight.value = withDelay(
      delayMs,
      withTiming(height, {
        duration: 380,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [barHeight, delayMs, height]);

  useEffect(() => {
    // Outline is the main select feedback — spring it on like web's ring.
    ring.value = withTiming(selected ? 1 : 0, {
      duration: selected ? 260 : 180,
      easing: selected ? Easing.out(Easing.cubic) : Easing.in(Easing.ease),
    });
  }, [ring, selected]);

  const barStyle = useAnimatedStyle(() => ({
    height: barHeight.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value,
    transform: [{ scale: 0.82 + ring.value * 0.18 }],
  }));

  return (
    <View
      style={{
        width: "100%",
        maxWidth: 32,
        overflow: "visible",
      }}
    >
      <Animated.View
        style={[
          {
            width: "100%",
            borderRadius: 3,
            backgroundColor: worked ? colors.action : colors.surface2,
          },
          barStyle,
        ]}
      />
      {/* Web ring-2 + ring-offset-2: outline sits outside the bar with a bg gap. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: -6,
            right: -6,
            bottom: -6,
            left: -6,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: colors.action,
          },
          ringStyle,
        ]}
      />
    </View>
  );
}

export default function WeekStoryScreen() {
  const catalog = useCatalog();
  const { isAuthenticated } = useMobileAuth();
  const remoteSessions = useQuery(
    api.routes.insights.queries.sessionHistory,
    isAuthenticated ? { days: 7 } : "skip",
  );
  const overview = useMergedInsightsOverview(
    7,
    isAuthenticated ? remoteSessions : undefined,
  );
  const history = useMergedInsightsSessions(
    7,
    isAuthenticated ? remoteSessions : undefined,
  );
  const [selectedDayStart, setSelectedDayStart] = useState<number | null>(null);

  const loading = overview === undefined || history === undefined;

  const weekSessions = useMemo((): WeekSession[] => {
    if (!history) return [];
    return history.map((s) => ({
      id: s.sessionId,
      name: s.templateName,
      completedAt: s.completedAt,
      durationMs: s.durationMs,
      volume: s.volume,
      summary:
        s.exercises
          .filter((ex) => ex.completedCount > 0)
          .map((ex) => `${catalog.short(ex.slug)} ${ex.completedCount}`)
          .join(" · ") || "No sets checked off",
      segments: buildMuscleSegments(
        s.exercises.map((ex) => ({
          slug: ex.slug,
          sets: ex.completedCount,
        })),
        catalog,
      ),
    }));
  }, [history, catalog]);

  const days = useMemo(() => buildRollingDays(weekSessions), [weekSessions]);

  const selectedDay =
    selectedDayStart === null
      ? null
      : (days.find((day) => day.dayStart === selectedDayStart) ?? null);

  const timelineDays = selectedDay ? [selectedDay] : days;

  const weekCount = overview?.stats.workoutCount ?? 0;
  const totalVolume = overview?.stats.totalVolume ?? 0;
  const momentum = formatMomentum(
    overview?.stats.totalVolume ?? 0,
    overview?.stats.priorTotalVolume ?? 0,
  );
  const volumeTrend = overview?.volumeTrend.map((point) => point.volume) ?? [];
  const maxVolume = Math.max(...days.map((d) => d.volume), 1);
  const hasAnySession = weekSessions.length > 0;

  function toggleDay(dayStart: number) {
    void Haptics.selectionAsync();
    setSelectedDayStart((current) => (current === dayStart ? null : dayStart));
  }

  return (
    <Screen>
      <PageHeader back title="Last 7 days" subtitle="Rolling week" />

      {loading ? (
        <Text style={{ color: colors.dim, fontSize: 14 }}>Loading…</Text>
      ) : (
        <View style={{ gap: 22 }}>
          <Animated.View entering={riseIn(0)}>
            <Card style={{ padding: 16, gap: 14 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 14,
                }}
              >
                <ProgressRing
                  value={Math.min(1, weekCount / WEEKLY_GOAL)}
                  label={`${weekCount}/${WEEKLY_GOAL}`}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: colors.dim,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 1.8,
                    }}
                  >
                    THIS WEEK
                  </Text>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 24,
                      fontWeight: "700",
                      letterSpacing: -0.4,
                      marginTop: 4,
                    }}
                  >
                    {weekCount} of {WEEKLY_GOAL} sessions
                  </Text>
                  <Text
                    style={{ color: colors.dim, fontSize: 13, marginTop: 4 }}
                  >
                    {volume(totalVolume)} total · {momentum} vs prior
                  </Text>
                </View>
              </View>
              <Sparkline values={volumeTrend} />
            </Card>
          </Animated.View>

          <Animated.View entering={riseIn(60)} style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}
              >
                Day by day
              </Text>
              <Text style={{ color: colors.dim, fontSize: 11 }}>
                {selectedDay ? "Tap again for full week" : "Tap a day to focus"}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6, overflow: "visible" }}>
              {days.map((day, index) => {
                const worked = day.sessions.length > 0;
                const selected = selectedDayStart === day.dayStart;
                const dimmed = selectedDayStart !== null && !selected;
                const barH = worked
                  ? Math.max(18, Math.round((day.volume / maxVolume) * 56))
                  : 6;
                return (
                  <Pressable
                    key={day.key}
                    onPress={() => toggleDay(day.dayStart)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => ({
                      flex: 1,
                      alignItems: "center",
                      gap: 6,
                      opacity: dimmed ? 0.35 : 1,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    })}
                  >
                    <View
                      style={{
                        height: 56,
                        width: "100%",
                        justifyContent: "flex-end",
                        alignItems: "center",
                        overflow: "visible",
                        paddingHorizontal: 2,
                      }}
                    >
                      <DayVolumeBar
                        height={barH}
                        worked={worked}
                        selected={selected}
                        delayMs={80 + index * 35}
                      />
                    </View>
                    <View
                      style={
                        selected || day.isToday
                          ? {
                              padding: 2,
                              borderRadius: radius.sm + 2,
                              borderWidth: 2,
                              borderColor: colors.action,
                            }
                          : undefined
                      }
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: radius.sm,
                          borderWidth: 1,
                          borderColor: worked ? colors.text : colors.line,
                          backgroundColor: worked
                            ? colors.text
                            : colors.surface2,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {worked ? (
                          <Check size={14} color={colors.actionText} />
                        ) : (
                          <Text
                            style={{
                              color: colors.dim,
                              fontSize: 10,
                              fontWeight: "700",
                            }}
                          >
                            {day.weekday.charAt(0)}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Text
                      style={{
                        color:
                          selected || day.isToday ? colors.text : colors.dim,
                        fontSize: 10,
                        fontWeight: "600",
                      }}
                    >
                      {day.weekday}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          <Animated.View entering={riseIn(120)} style={{ gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}
              >
                {selectedDay
                  ? `${selectedDay.weekday} · ${selectedDay.dateLabel}`
                  : "Timeline"}
              </Text>
              {selectedDay ? (
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setSelectedDayStart(null);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: colors.dim,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  >
                    Show full week
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {!hasAnySession && !selectedDay ? (
              <EmptyState
                icon={History}
                title="No workouts yet"
                description="Finish a session this week and it’ll show up here day by day."
              />
            ) : (
              <Animated.View
                key={selectedDayStart ?? "week"}
                entering={FadeIn.duration(220).easing(Easing.out(Easing.ease))}
                style={{
                  borderLeftWidth: 1,
                  borderLeftColor: colors.line,
                  paddingLeft: 16,
                  gap: 12,
                }}
              >
                {[...timelineDays].reverse().map((day) => (
                  <View key={day.key} style={{ position: "relative" }}>
                    <View
                      style={{
                        position: "absolute",
                        left: -21,
                        top: 16,
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        borderWidth: 2,
                        borderColor: colors.bg,
                        backgroundColor:
                          day.sessions.length > 0
                            ? colors.action
                            : colors.surface2,
                      }}
                    />
                    {day.sessions.length === 0 ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          borderWidth: 1,
                          borderStyle: "dashed",
                          borderColor: colors.line,
                          borderRadius: radius.lg,
                          backgroundColor: `${colors.surface}80`,
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                        }}
                      >
                        <Moon size={16} color={colors.dim} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              color: colors.dim,
                              fontSize: 14,
                              fontWeight: "600",
                            }}
                          >
                            Rest
                          </Text>
                          <Text style={{ color: colors.faint, fontSize: 11 }}>
                            {day.weekday} · {day.dateLabel}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {day.sessions.map((session, index) => (
                          <Pressable
                            key={session.id}
                            onPress={() =>
                              router.push({
                                pathname: "/workout/[sessionId]",
                                params: { sessionId: session.id },
                              })
                            }
                            style={({ pressed }) => ({
                              transform: [{ scale: pressed ? 0.98 : 1 }],
                            })}
                          >
                            <Card style={{ padding: 12, gap: 8 }}>
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "flex-start",
                                  gap: 8,
                                }}
                              >
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  {index === 0 ? (
                                    <Text
                                      style={{
                                        color: colors.dim,
                                        fontSize: 11,
                                        fontWeight: "700",
                                        letterSpacing: 1.4,
                                      }}
                                    >
                                      {day.weekday.toUpperCase()} ·{" "}
                                      {day.dateLabel.toUpperCase()}
                                      {day.isToday ? " · TODAY" : ""}
                                    </Text>
                                  ) : null}
                                  <Text
                                    numberOfLines={1}
                                    style={{
                                      color: colors.text,
                                      fontSize: 16,
                                      fontWeight: "700",
                                      marginTop: index === 0 ? 4 : 0,
                                    }}
                                  >
                                    {session.name}
                                  </Text>
                                  <Text
                                    style={{
                                      color: colors.dim,
                                      fontSize: 11,
                                      marginTop: 2,
                                    }}
                                  >
                                    {formatDuration(session.durationMs)} ·{" "}
                                    {volume(session.volume)}
                                  </Text>
                                </View>
                                <ChevronRight size={16} color={colors.dim} />
                              </View>
                              <Text
                                numberOfLines={2}
                                style={{
                                  color: colors.dim,
                                  fontSize: 12,
                                  lineHeight: 17,
                                }}
                              >
                                {session.summary}
                              </Text>
                              <MuscleBand segments={session.segments} />
                            </Card>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </Animated.View>
            )}
          </Animated.View>

          <Animated.View entering={riseIn(180)}>
            <Button
              label="See all workouts"
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: "/insights/sessions",
                  params: { days: "7" },
                })
              }
            />
          </Animated.View>
        </View>
      )}
    </Screen>
  );
}
