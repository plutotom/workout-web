"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { BarChart3, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { api } from "@backend/api";
import {
  CustomExerciseDialog,
  type EditableCustomExercise,
} from "@/components/app/custom-exercise-dialog";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { ExerciseNoteField } from "@/components/app/exercise-note-field";
import { ExerciseHistoryTab } from "@/components/app/insights/exercise-history-tab";
import { ExerciseRecordsTab } from "@/components/app/insights/exercise-records-tab";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { customExerciseId, muscleGroupLabel } from "@/lib/exercise-browser";
import {
  insightsDaysToArg,
  parseInsightsDaysParam,
  type InsightsDays,
} from "@/lib/insights/format";
import type { ExerciseSession } from "@/lib/insights/types";

type Tab = "summary" | "history" | "howto";
type ChartMetric = "weight" | "e1rm" | "volume";

const CHART_METRICS: { id: ChartMetric; label: string }[] = [
  { id: "weight", label: "Heaviest weight" },
  { id: "e1rm", label: "One-rep max" },
  { id: "volume", label: "Best set volume" },
];

function safeInternalHref(from: string | undefined, fallback: string) {
  if (!from) return fallback;
  if (!from.startsWith("/") || from.startsWith("//")) return fallback;
  return from;
}

function sessionMetric(session: ExerciseSession, metric: ChartMetric): number {
  if (metric === "e1rm") return session.bestEst1RM;
  if (metric === "weight") {
    return session.sets.reduce((max, set) => Math.max(max, set.weight), 0);
  }
  return session.sets.reduce((sum, set) => {
    return sum + set.weight * set.reps;
  }, 0);
}

export function ExerciseDetail({
  slug,
  daysParam,
  fromParam,
}: {
  slug: string;
  daysParam?: string;
  fromParam?: string;
}) {
  const catalog = useExerciseCatalog();
  const days: InsightsDays = daysParam
    ? parseInsightsDaysParam(daysParam)
    : "all";
  const backHref = safeInternalHref(fromParam, "/exercises");
  const [tab, setTab] = useState<Tab>("summary");
  const [metric, setMetric] = useState<ChartMetric>("weight");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const archive = useMutation(api.routes.exercises.mutations.archive);
  const restore = useMutation(api.routes.exercises.mutations.restore);

  const history = useQuery(api.routes.insights.queries.exerciseHistory, {
    slug,
    days: insightsDaysToArg(days),
  });
  const records = useQuery(api.routes.insights.queries.exerciseRecords, {
    slug,
  });
  const notes = useQuery(api.routes.exercises.queries.getNotes, {
    slugs: [slug],
  });
  const templates = useQuery(api.routes.templates.queries.list);

  const exercise = catalog.get(slug);
  const customId = customExerciseId(slug);
  const isCustom = customId !== null;
  const archived = exercise?.archived === true;

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

  const usedIn = useMemo(() => {
    if (!templates) return [];
    return templates.filter((t) => t.exercises.some((e) => e.slug === slug));
  }, [templates, slug]);

  const chartPoints = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    const chronological = [...sessions].reverse().slice(-16);
    return chronological.map((session) => sessionMetric(session, metric));
  }, [sessions, metric]);

  const editExercise: EditableCustomExercise | undefined =
    isCustom && exercise
      ? {
          id: customId,
          name: exercise.name,
          category: exercise.category,
          usesBar: catalog.usesBar(slug),
        }
      : undefined;

  async function handleArchive() {
    if (!customId) return;
    try {
      await archive({ exerciseId: customId });
      toast.success("Exercise archived");
      setMenuOpen(false);
    } catch {
      toast.error("Couldn't archive exercise");
    }
  }

  async function handleRestore() {
    if (!customId) return;
    try {
      await restore({ exerciseId: customId });
      toast.success("Exercise restored");
      setMenuOpen(false);
    } catch {
      toast.error("Couldn't restore exercise");
    }
  }

  const loading = history === undefined || records === undefined;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={catalog.name(slug)}
        backHref={backHref}
        action={
          isCustom ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-11"
              aria-label="Exercise actions"
              onClick={() => setMenuOpen(true)}
            >
              <MoreHorizontal className="size-5" />
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-full">
          <TabsTrigger value="summary" className="flex-1">
            Summary
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            History
          </TabsTrigger>
          <TabsTrigger value="howto" className="flex-1">
            How to
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 flex flex-col gap-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {catalog.name(slug)}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {exercise
                ? muscleGroupLabel(exercise.category)
                : "Unknown muscle group"}
              {isCustom ? " · Custom" : ""}
              {archived ? " · Archived" : ""}
            </p>
          </div>

          <ProgressChart points={chartPoints} loading={loading} />

          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CHART_METRICS.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="sm"
                variant={metric === m.id ? "default" : "outline"}
                className="h-9 shrink-0"
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </div>

          {records ? (
            <ExerciseRecordsTab
              records={{
                est1RM: records.est1RM,
                bestWeight: records.bestWeight,
                bestReps: records.bestReps,
                maxVolume: records.maxVolume,
                repLadder: records.repLadder,
              }}
            />
          ) : (
            <p className="text-muted-foreground text-sm">Loading records…</p>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {sessions ? (
            <ExerciseHistoryTab sessions={sessions} />
          ) : (
            <p className="text-muted-foreground text-sm">Loading…</p>
          )}
        </TabsContent>

        <TabsContent value="howto" className="mt-4 flex flex-col gap-5">
          <dl className="flex flex-col gap-3 rounded-xl border bg-[var(--surface)] px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Muscle</dt>
              <dd className="font-medium">
                {exercise ? muscleGroupLabel(exercise.category) : "Unknown"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">Barbell</dt>
              <dd className="font-medium">
                {catalog.usesBar(slug) ? "Yes — plates include the bar" : "No"}
              </dd>
            </div>
          </dl>

          <section className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Your notes
            </h2>
            {notes === undefined ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : (
              <ExerciseNoteField
                exerciseSlug={slug}
                initialNotes={notes[slug] ?? ""}
              />
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Used in templates
            </h2>
            {templates === undefined ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : usedIn.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Not in any of your templates yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {usedIn.map((template) => (
                  <li key={template._id}>
                    <Link
                      href={`/templates/${template._id}`}
                      className="flex min-h-11 items-center justify-between rounded-lg border bg-[var(--surface)] px-3 text-sm font-medium active:bg-muted/40"
                    >
                      {template.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
      </Tabs>

      {isCustom ? (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <SheetHeader className="px-0">
              <SheetTitle>Manage</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-base"
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
              >
                Edit
              </button>
              {archived ? (
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-base"
                  onClick={() => void handleRestore()}
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="text-destructive flex min-h-11 w-full items-center rounded-lg px-3 text-left text-base"
                  onClick={() => void handleArchive()}
                >
                  Archive
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {editExercise ? (
        <CustomExerciseDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          defaultGroup={editExercise.category}
          exercise={editExercise}
        />
      ) : null}
    </div>
  );
}

function ProgressChart({
  points,
  loading,
}: {
  points: number[];
  loading: boolean;
}) {
  const max = Math.max(0, ...points);

  return (
    <div className="flex min-h-40 flex-col justify-end rounded-xl border bg-[var(--surface)] px-4 py-4">
      {loading ? (
        <p className="text-muted-foreground self-center text-sm">Loading…</p>
      ) : points.length === 0 || max <= 0 ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <BarChart3 className="text-muted-foreground size-8" />
          <p className="text-muted-foreground text-sm">No data yet</p>
        </div>
      ) : (
        <div className="flex h-32 items-end gap-1">
          {points.map((value, index) => (
            <div
              key={index}
              className="bg-foreground/80 min-h-0.5 flex-1 rounded-t"
              style={{ height: `${Math.max(4, (value / max) * 100)}%` }}
              title={String(value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
