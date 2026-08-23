"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Check, ChevronRight, History, Moon } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { PageHeader } from "@/components/app/page-header";
import {
  buildMuscleSegments,
  formatDuration,
  formatLb,
  MiniSparkline,
  MuscleBand,
  ProgressRing,
  type MuscleSegment,
} from "@/components/app/workout-design";
import { Button } from "@/components/ui/button";
import { summarizeSessionExercises } from "@/lib/insights/map-sessions";
import { cn } from "@/lib/utils";

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
  isHealthSummary: boolean;
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
    // Clamp early rolling-window sessions onto the oldest visible calendar day
    // so a 7×24h query never drops a workout from the 7-day strip.
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

export function WeekStory() {
  const catalog = useExerciseCatalog();
  const overview = useQuery(api.routes.insights.queries.overview, {
    days: 7,
  });
  const history = useQuery(api.routes.insights.queries.sessionHistory, {
    days: 7,
  });
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
      isHealthSummary: s.sessionKind === "health_summary",
      summary: summarizeSessionExercises(s.exercises, catalog.short, s),
      segments: buildMuscleSegments(
        s.exercises.map((ex) => ({
          slug: ex.slug,
          sets: ex.completedCount,
          category: catalog.category,
        })),
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
  const volumeTrend = overview?.volumeTrend?.map((point) => point.volume) ?? [];
  const maxVolume = Math.max(...days.map((d) => d.volume), 1);
  const hasAnySession = weekSessions.length > 0;

  function toggleDay(dayStart: number) {
    setSelectedDayStart((current) => (current === dayStart ? null : dayStart));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Last 7 days"
        description="Rolling week"
        backHref="/dashboard"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="animate-rise-in overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-start gap-4">
              <ProgressRing
                value={Math.min(1, weekCount / WEEKLY_GOAL)}
                label={`${weekCount}/${WEEKLY_GOAL}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  This week
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {weekCount} of {WEEKLY_GOAL} sessions
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatLb(totalVolume)} total · {momentum} vs prior
                </p>
              </div>
            </div>
            <div className="mt-4 h-12 text-foreground">
              <MiniSparkline values={volumeTrend} />
            </div>
          </section>

          <section className="animate-rise-in">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="text-sm font-medium">Day by day</h2>
              <p className="text-xs text-muted-foreground">
                {selectedDay ? "Tap again for full week" : "Tap a day to focus"}
              </p>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((day) => {
                const worked = day.sessions.length > 0;
                const selected = selectedDayStart === day.dayStart;
                const dimmed = selectedDayStart !== null && !selected;
                const barH = worked
                  ? Math.max(18, Math.round((day.volume / maxVolume) * 56))
                  : 6;
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.dayStart)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg py-1 transition-opacity active:scale-[0.96]",
                      dimmed && "opacity-35",
                    )}
                    aria-pressed={selected}
                    aria-label={
                      selected
                        ? `${day.weekday}: selected, tap to show full week`
                        : worked
                          ? `${day.weekday}: ${day.sessions.length} workout${day.sessions.length === 1 ? "" : "s"}, tap to focus`
                          : `${day.weekday}: rest, tap to focus`
                    }
                  >
                    <div className="flex h-14 w-full items-end justify-center">
                      <span
                        className={cn(
                          "w-full max-w-8 rounded-sm transition-all",
                          worked
                            ? "bg-[var(--action)]"
                            : "bg-[var(--surface-2)]",
                          selected &&
                            "ring-2 ring-[var(--action)] ring-offset-2 ring-offset-background",
                        )}
                        style={{ height: barH }}
                        aria-hidden
                      />
                    </div>
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-md border text-[10px] font-semibold",
                        worked
                          ? "border-foreground bg-foreground text-background"
                          : "border-muted bg-muted/40 text-muted-foreground",
                        (selected || day.isToday) &&
                          "ring-2 ring-[var(--action)] ring-offset-2 ring-offset-background",
                      )}
                    >
                      {worked ? (
                        <Check className="size-3.5" />
                      ) : (
                        day.weekday.charAt(0)
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium",
                        selected || day.isToday
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {day.weekday}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="animate-rise-in flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-sm font-medium">
                {selectedDay
                  ? `${selectedDay.weekday} · ${selectedDay.dateLabel}`
                  : "Timeline"}
              </h2>
              {selectedDay ? (
                <button
                  type="button"
                  onClick={() => setSelectedDayStart(null)}
                  className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Show full week
                </button>
              ) : null}
            </div>
            {!hasAnySession && !selectedDay ? (
              <EmptyState
                icon={History}
                title="No workouts yet"
                description="Finish a session this week and it’ll show up here day by day."
                className="py-10"
              />
            ) : (
              <ol className="relative flex flex-col gap-3 border-l border-[var(--line)] pl-4">
                {[...timelineDays].reverse().map((day) => (
                  <li key={day.key} className="relative">
                    <span
                      className={cn(
                        "absolute top-4 -left-[1.35rem] size-2.5 rounded-full border-2 border-background",
                        day.sessions.length > 0
                          ? "bg-[var(--action)]"
                          : "bg-[var(--surface-2)]",
                      )}
                    />
                    {day.sessions.length === 0 ? (
                      <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)]/50 px-3 py-3">
                        <Moon className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-muted-foreground">
                            Rest
                          </p>
                          <p className="text-xs text-muted-foreground/80">
                            {day.weekday} · {day.dateLabel}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {day.sessions.map((session, index) => (
                          <Link
                            key={session.id}
                            href={`/workout/${session.id}`}
                            className="block overflow-hidden rounded-xl border bg-[var(--surface)] p-3 transition-all active:scale-[0.98]"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                {index === 0 ? (
                                  <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                                    {day.weekday} · {day.dateLabel}
                                    {day.isToday ? " · Today" : ""}
                                  </p>
                                ) : null}
                                <h3
                                  className={cn(
                                    "truncate text-base font-semibold",
                                    index === 0 ? "mt-1" : "mt-0",
                                  )}
                                >
                                  {session.name}
                                </h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {formatDuration(session.durationMs)}
                                  {session.isHealthSummary
                                    ? null
                                    : ` · ${formatLb(session.volume)}`}
                                </p>
                              </div>
                              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground/90">
                              {session.summary}
                            </p>
                            {session.isHealthSummary ? null : (
                              <MuscleBand
                                segments={session.segments}
                                className="mt-3"
                              />
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <Button asChild variant="outline" className="w-full">
            <Link href="/insights/sessions?days=7">See all workouts</Link>
          </Button>
        </>
      )}
    </div>
  );
}
