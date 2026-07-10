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
  formatVolume,
  INSIGHTS_DAY_OPTIONS,
  insightsDaysToArg,
  MIN_GROUP_LIFTS,
  RECENT_SESSIONS_LIMIT,
  TOP_LIFTS_LIMIT,
  type InsightsDays,
} from "@/lib/insights/format";
import { mapQueryLifts } from "@/lib/insights/map-lifts";
import { mapQuerySessions } from "@/lib/insights/map-sessions";
import type { MuscleVolume, OverviewStats } from "@/lib/insights/types";

import { InsightsSection, InsightsSectionLink } from "./insights-section";
import { InsightsStatGrid } from "./insights-stat-grid";
import { MuscleVolumeBars } from "./muscle-volume-bars";
import { RecentSessionsList } from "./recent-sessions-list";
import { TopLiftsList } from "./top-lifts-list";

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
  const [showAllGroupLifts, setShowAllGroupLifts] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);

  const overview = useQuery(api.routes.insights.queries.overview, {
    days: insightsDaysToArg(days),
  });

  const selectMuscleFilter = (id: string | null) => {
    setMuscleFilter(id);
    setShowAllGroupLifts(false);
  };

  const stats = useMemo((): OverviewStats | undefined => {
    if (!overview) return undefined;
    return {
      workouts: overview.stats.workoutCount,
      durationMinutes: Math.round(overview.stats.totalDurationMs / 60_000),
      volumeLb: overview.stats.totalVolume,
      streakWeeks: overview.stats.weekStreak,
      muscles: groupVolumeByMuscle(overview.volumeBySlug, catalog.category),
      lifts: mapQueryLifts(overview.topLifts, catalog.category),
      sessions: mapQuerySessions(overview.recentSessions, catalog.short),
    };
  }, [overview, catalog]);

  const displayStats = showEmpty ? EMPTY_STATS : stats;
  const groupLifts =
    displayStats && muscleFilter
      ? displayStats.lifts.filter((l) => l.group === muscleFilter)
      : [];
  const filteredLifts = displayStats
    ? muscleFilter
      ? showAllGroupLifts
        ? groupLifts
        : groupLifts.slice(0, MIN_GROUP_LIFTS)
      : displayStats.lifts.slice(0, TOP_LIFTS_LIMIT)
    : [];
  const muscleLabel = displayStats?.muscles.find(
    (m) => m.id === muscleFilter,
  )?.label;
  const hasMoreLifts =
    !muscleFilter && (displayStats?.lifts.length ?? 0) > TOP_LIFTS_LIMIT;
  const hasMoreSessions = (displayStats?.workouts ?? 0) > RECENT_SESSIONS_LIMIT;
  const hasMoreGroupLifts =
    !!muscleFilter && groupLifts.length > MIN_GROUP_LIFTS && !showAllGroupLifts;

  const hasData = (displayStats?.workouts ?? 0) > 0;
  const topLift = displayStats?.lifts[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-[var(--surface)] p-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Insights
        </p>
        <div className="mt-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {displayStats ? formatVolume(displayStats.volumeLb) : "Loading"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {topLift
              ? `Top lift · ${catalog.short(topLift.slug)} ${topLift.weight} lb`
              : "Your training signal will collect here."}
          </p>
        </div>
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
              onSelect={selectMuscleFilter}
            />
          </InsightsSection>

          <InsightsSection
            title="Top lifts"
            action={
              muscleFilter ? (
                <button
                  type="button"
                  onClick={() => selectMuscleFilter(null)}
                  className="bg-muted text-foreground rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted/80"
                >
                  {muscleLabel} ×
                </button>
              ) : hasMoreLifts ? (
                <InsightsSectionLink href={`/insights/lifts?days=${days}`}>
                  See all
                </InsightsSectionLink>
              ) : (
                <span className="text-muted-foreground text-xs">All</span>
              )
            }
          >
            <TopLiftsList lifts={filteredLifts} days={days} />
            {hasMoreGroupLifts ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-auto self-start px-0 text-xs font-medium"
                onClick={() => setShowAllGroupLifts(true)}
              >
                See all {groupLifts.length} in {muscleLabel}
              </Button>
            ) : null}
          </InsightsSection>

          <InsightsSection
            title="Recent sessions"
            action={
              hasMoreSessions ? (
                <InsightsSectionLink href={`/insights/sessions?days=${days}`}>
                  View all
                </InsightsSectionLink>
              ) : undefined
            }
          >
            <RecentSessionsList sessions={displayStats.sessions} />
          </InsightsSection>
        </>
      ) : null}
    </div>
  );
}
