"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Dumbbell } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  insightsDaysToArg,
  parseInsightsDaysParam,
  type InsightsDays,
} from "@/lib/insights/format";
import type { ExerciseSession } from "@/lib/insights/types";

import { ExerciseHistoryTab } from "./exercise-history-tab";
import { ExerciseRecordsTab } from "./exercise-records-tab";

export function ExerciseInsights({
  slug,
  daysParam,
}: {
  slug: string;
  daysParam?: string;
}) {
  const catalog = useExerciseCatalog();
  const days: InsightsDays = parseInsightsDaysParam(daysParam);
  const [tab, setTab] = useState<"history" | "records">("history");

  const history = useQuery(api.routes.insights.queries.exerciseHistory, {
    slug,
    days: insightsDaysToArg(days),
  });
  const records = useQuery(api.routes.insights.queries.exerciseRecords, {
    slug,
  });

  const sessions = useMemo((): ExerciseSession[] | undefined => {
    if (!history) return undefined;
    return history.sessions.map((s) => ({
      id: s.sessionId,
      workoutName: s.templateName,
      completedAt: s.completedAt,
      bestEst1RM: s.bestEst1RM,
      sets: s.sets.map((set) => ({
        weight: set.weight,
        reps: set.reps,
      })),
    }));
  }, [history]);

  const hasHistory = (sessions?.length ?? 0) > 0;
  const hasRecords = (records?.est1RM ?? 0) > 0;

  if (history === undefined || records === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={catalog.name(slug)} backHref="/insights" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!hasHistory && !hasRecords) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={catalog.name(slug)} backHref="/insights" />
        <EmptyState
          icon={Dumbbell}
          title="No data for this exercise"
          description="Log sets with weight and reps during a workout to see history and records here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={catalog.name(slug)} backHref="/insights" />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "history" | "records")}
      >
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="records">Records</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          <ExerciseHistoryTab sessions={sessions ?? []} />
        </TabsContent>

        <TabsContent value="records" className="mt-4">
          <ExerciseRecordsTab
            records={{
              est1RM: records.est1RM,
              bestWeight: records.bestWeight,
              bestReps: records.bestReps,
              maxVolume: records.maxVolume,
              repLadder: records.repLadder,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
