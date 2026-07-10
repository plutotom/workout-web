"use client";

import { useMemo } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Dumbbell } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/exercises";
import {
  INSIGHTS_DAY_OPTIONS,
  insightsDaysToArg,
  parseInsightsDaysParam,
  type InsightsDays,
} from "@/lib/insights/format";
import { mapQueryLifts } from "@/lib/insights/map-lifts";

import { TopLiftsList } from "./top-lifts-list";

function parseGroupParam(value: string | undefined): MuscleGroup | null {
  if (!value) return null;
  return MUSCLE_GROUPS.some((g) => g.id === value)
    ? (value as MuscleGroup)
    : null;
}

export function InsightsLifts({
  daysParam,
  groupParam,
}: {
  daysParam?: string;
  groupParam?: string;
}) {
  const catalog = useExerciseCatalog();
  const days: InsightsDays = parseInsightsDaysParam(daysParam);
  const group = parseGroupParam(groupParam);

  const lifts = useQuery(api.routes.insights.queries.lifts, {
    days: insightsDaysToArg(days),
  });

  const mappedLifts = useMemo(() => {
    if (!lifts) return undefined;
    const all = mapQueryLifts(lifts, catalog.category);
    return group ? all.filter((lift) => lift.group === group) : all;
  }, [lifts, catalog, group]);

  const groupLabel = group
    ? MUSCLE_GROUPS.find((g) => g.id === group)?.label
    : null;
  const title = groupLabel ? `${groupLabel} lifts` : "All lifts";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={title}
        description={INSIGHTS_DAY_OPTIONS.find((o) => o.value === days)?.label}
        backHref="/insights"
      />

      {mappedLifts === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : mappedLifts.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No lifts in this period"
          description="Complete workouts with weighted sets to see lift rankings here."
        />
      ) : (
        <TopLiftsList lifts={mappedLifts} days={days} />
      )}
    </div>
  );
}
