"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { History } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import {
  INSIGHTS_DAY_OPTIONS,
  insightsDaysToArg,
  parseInsightsDaysParam,
  SESSIONS_PAGE_SIZE,
  type InsightsDays,
} from "@/lib/insights/format";
import { mapQuerySessions } from "@/lib/insights/map-sessions";

import { RecentSessionsList } from "./recent-sessions-list";

export function InsightsSessions({ daysParam }: { daysParam?: string }) {
  const catalog = useExerciseCatalog();
  const days: InsightsDays = parseInsightsDaysParam(daysParam);
  const [visibleCount, setVisibleCount] = useState(SESSIONS_PAGE_SIZE);

  const sessions = useQuery(api.routes.insights.queries.sessionHistory, {
    days: insightsDaysToArg(days),
  });

  const mappedSessions = useMemo(() => {
    if (!sessions) return undefined;
    return mapQuerySessions(sessions, catalog.short);
  }, [sessions, catalog]);

  const visibleSessions = mappedSessions?.slice(0, visibleCount) ?? [];
  const hasMore = (mappedSessions?.length ?? 0) > visibleCount;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="All workouts"
        description={INSIGHTS_DAY_OPTIONS.find((o) => o.value === days)?.label}
        backHref={`/insights?days=${days}`}
      />

      {mappedSessions === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : mappedSessions.length === 0 ? (
        <EmptyState
          icon={History}
          title="No workouts in this period"
          description="Finished workouts will show up here for the selected time range."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <RecentSessionsList sessions={visibleSessions} />
          {hasMore ? (
            <Button
              variant="outline"
              size="sm"
              className="self-center"
              onClick={() =>
                setVisibleCount((count) => count + SESSIONS_PAGE_SIZE)
              }
            >
              Load more
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
