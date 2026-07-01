"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { TrendingUp } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/exercises";
import {
  INSIGHTS_DAY_OPTIONS,
  insightsDaysToArg,
  type InsightsDays,
} from "@/lib/insights/format";
import type { MuscleVolume, OverviewStats } from "@/lib/insights/types";

import { InsightsSection } from "./insights-section";
import { InsightsStatGrid } from "./insights-stat-grid";
import { MuscleVolumeBars } from "./muscle-volume-bars";
import { RecentSessionsList } from "./recent-sessions-list";
import { TopLiftsList } from "./top-lifts-list";

function summarize(
  exercises: { slug: string; completedCount: number }[],
  short: (slug: string) => string,
): string {
  const done = exercises.filter((e) => e.completedCount > 0);
  if (done.length === 0) return "No sets checked off";
  return done.map((e) => `${short(e.slug)} ${e.completedCount}`).join(" · ");
}

function groupVolumeByMuscle(
  volumeBySlug: { slug: string; volume: number }[],
  category: (slug: string) => MuscleGroup | undefined,
): MuscleVolume[] {
  const byGroup = new Map<MuscleGroup, number>();
  for (const { slug, volume } of volumeBySlug) {
    const cat = category(slug);
    if (!cat) continue;
    byGroup.set(cat, (byGroup.get(cat) ?? 0) + volume);
  }
  const total = Array.from(byGroup.values()).reduce((sum, v) => sum + v, 0);
  return MUSCLE_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    volumeLb: byGroup.get(g.id) ?? 0,
    pct: total > 0 ? Math.round(((byGroup.get(g.id) ?? 0) / total) * 100) : 0,
  })).filter((m) => m.volumeLb > 0);
}

const EMPTY_STATS: OverviewStats = {
  workouts: 0,
  durationMinutes: 0,
  volumeLb: 0,
  streakWeeks: 0,
  muscles: [],
  lifts: [],
  sessions: [],
};

export function InsightsOverview() {
  const catalog = useExerciseCatalog();
  const [days, setDays] = useState<InsightsDays>("30");
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

  const overview = useQuery(api.routes.insights.queries.overview, {
    days: insightsDaysToArg(days),
  });

  const stats = useMemo((): OverviewStats | undefined => {
    if (!overview) return undefined;
    return {
      workouts: overview.stats.workoutCount,
      durationMinutes: Math.round(overview.stats.totalDurationMs / 60_000),
      volumeLb: overview.stats.totalVolume,
      streakWeeks: overview.stats.weekStreak,
      muscles: groupVolumeByMuscle(overview.volumeBySlug, catalog.category),
      lifts: overview.topLifts
        .map((lift) => {
          const group = catalog.category(lift.slug);
          if (!group) return null;
          return {
            slug: lift.slug,
            weight: lift.bestWeight,
            sessions: lift.sessionCount,
            est1RM: lift.est1RM,
            trend: lift.trend,
            group,
          };
        })
        .filter((lift): lift is NonNullable<typeof lift> => lift !== null),
      sessions: overview.recentSessions.map((s) => ({
        id: s.sessionId,
        name: s.templateName,
        completedAt: s.completedAt,
        durationMinutes: Math.round(s.durationMs / 60_000),
        volumeLb: s.volume,
        summary: summarize(s.exercises, catalog.short),
      })),
    };
  }, [overview, catalog]);

  const displayStats = showEmpty ? EMPTY_STATS : stats;
  const filteredLifts = displayStats
    ? muscleFilter
      ? displayStats.lifts.filter((l) => l.group === muscleFilter)
      : displayStats.lifts
    : [];
  const muscleLabel = displayStats?.muscles.find(
    (m) => m.id === muscleFilter,
  )?.label;

  const hasData = (displayStats?.workouts ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          How you&apos;re doing
        </p>
      </div>

      <Tabs value={days} onValueChange={(v) => setDays(v as InsightsDays)}>
        <TabsList className="w-full">
          {INSIGHTS_DAY_OPTIONS.map((o) => (
            <TabsTrigger key={o.value} value={o.value} className="flex-1">
              {o.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {process.env.NODE_ENV === "development" ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setShowEmpty((v) => !v)}
        >
          {showEmpty ? "Show live data" : "Preview empty state"}
        </Button>
      ) : null}

      {overview === undefined && !showEmpty ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : !hasData ? (
        <EmptyState
          icon={TrendingUp}
          title="No insights yet"
          description="Complete a few workouts and your stats will show up here."
        />
      ) : displayStats ? (
        <>
          <InsightsStatGrid stats={displayStats} />

          <InsightsSection title="Volume by muscle group">
            <MuscleVolumeBars
              muscles={displayStats.muscles}
              activeId={muscleFilter}
              onSelect={setMuscleFilter}
            />
          </InsightsSection>

          <InsightsSection
            title="Top lifts"
            action={
              muscleFilter ? (
                <button
                  type="button"
                  onClick={() => setMuscleFilter(null)}
                  className="bg-muted text-foreground rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted/80"
                >
                  {muscleLabel} ×
                </button>
              ) : (
                <span className="text-muted-foreground text-xs">All</span>
              )
            }
          >
            <TopLiftsList lifts={filteredLifts} days={days} />
          </InsightsSection>

          <InsightsSection title="Recent sessions">
            <RecentSessionsList sessions={displayStats.sessions} />
          </InsightsSection>
        </>
      ) : null}
    </div>
  );
}
