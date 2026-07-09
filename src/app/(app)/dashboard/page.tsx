"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Dumbbell, Play } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { StartWorkoutButton } from "@/components/app/start-workout-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import {
  buildMuscleSegments,
  MiniSparkline,
  MuscleBand,
  ProgressRing,
} from "@/components/app/workout-design";

const WEEKLY_GOAL = 4;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function DashboardPage() {
  const catalog = useExerciseCatalog();
  const active = useQuery(api.routes.workouts.queries.active);
  const recent = useQuery(api.routes.workouts.queries.recent);
  const templates = useQuery(api.routes.templates.queries.list);
  const overview = useQuery(api.routes.insights.queries.overview, { days: 7 });

  const total = recent?.total ?? 0;
  const hasTemplates = (templates?.length ?? 0) > 0;
  const today = templates?.[0] ?? null;
  const weekCount = overview?.stats.workoutCount ?? 0;
  const currentVolume = overview?.stats.totalVolume ?? 0;
  const priorVolume = overview?.stats.priorTotalVolume ?? 0;
  const momentum = formatMomentum(currentVolume, priorVolume);
  const volumeTrend = overview?.volumeTrend?.map((point) => point.volume) ?? [];
  const muscleSegments = today
    ? buildMuscleSegments(
        today.exercises.map((ex) => ({
          slug: ex.slug,
          sets: ex.setCount,
          category: catalog.category,
        })),
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-rise-in">
        <p className="text-sm text-muted-foreground">{todayLabel()}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {greeting()}
        </h1>
      </div>

      {active ? (
        <Card className="animate-rise-in border-success/40 bg-success/5">
          <CardHeader>
            <CardTitle className="text-base">Workout in progress</CardTitle>
            <CardDescription>{active.templateName}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/workout/${active._id}`}>
                <Play className="size-4" />
                Continue workout
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : today ? (
        <Card className="animate-rise-in overflow-hidden border-[var(--line)] bg-[var(--surface)]">
          <CardHeader>
            <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Today
            </p>
            <CardTitle className="text-2xl">{today.name}</CardTitle>
            <CardDescription>
              {today.exercises.length} exercises · ~
              {today.exercises.reduce((sum, ex) => sum + ex.setCount, 0) * 3 +
                today.exercises.length * 2}{" "}
              min
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <MuscleBand segments={muscleSegments} />
            <StartWorkoutButton templateId={today._id} />
            <StartWorkoutButton
              mode="blank"
              variant="outline"
              label="Quick start"
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="animate-rise-in border-dashed">
          <CardHeader>
            <CardTitle>Start your first workout</CardTitle>
            <CardDescription>
              Jump in empty and add exercises as you go — or build a template
              first.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <StartWorkoutButton mode="blank" label="Quick start" />
            <Button asChild variant="outline" className="w-full">
              <Link href="/templates/new">
                <Dumbbell className="size-4" />
                New template
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="animate-rise-in bg-[var(--surface)]">
          <CardContent className="flex items-center gap-3 p-4">
            <ProgressRing
              value={Math.min(1, weekCount / WEEKLY_GOAL)}
              label={`${weekCount}/${WEEKLY_GOAL}`}
            />
            <div>
              <p className="text-sm font-medium">This week</p>
              <p className="text-xs text-muted-foreground">
                of {WEEKLY_GOAL} sessions
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="animate-rise-in overflow-hidden bg-[var(--surface)]">
          <CardContent className="grid h-full min-h-36 grid-rows-[auto_1fr] gap-2 p-4">
            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
                Momentum
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {momentum.value}
              </p>
              <p className="text-sm leading-tight text-muted-foreground">
                volume, vs
                <br />
                last week
              </p>
            </div>
            <MiniSparkline
              values={volumeTrend}
              className="self-end text-foreground"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Jump back in</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/templates">All templates</Link>
          </Button>
        </div>

        {templates === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !hasTemplates ? (
          <EmptyState
            title="No templates yet"
            description="Finish a quick start and save it as a template, or create one from scratch."
            action={
              <StartWorkoutButton
                mode="blank"
                variant="outline"
                label="Quick start"
                className="w-auto"
              />
            }
          />
        ) : (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {templates.slice(0, 6).map((template, index) => (
              <div
                key={template._id}
                className="w-[78%] max-w-[320px] shrink-0 snap-start"
              >
                <Card
                  className={
                    index === 0
                      ? "h-full border-foreground/40 bg-[var(--surface)]"
                      : "h-full bg-[var(--surface)]"
                  }
                >
                  <CardHeader>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription>
                      {template.exercises.length} exercises ·{" "}
                      {template.lastSessionAt
                        ? `last ${new Date(template.lastSessionAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                        : "not trained yet"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <StartWorkoutButton templateId={template._id} />
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>

      {total > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {total} workout{total === 1 ? "" : "s"} logged
        </p>
      ) : null}
    </div>
  );
}

function formatMomentum(current: number, prior: number) {
  if (prior <= 0) {
    return { value: current > 0 ? "New" : "0%" };
  }

  const pct = Math.round(((current - prior) / prior) * 100);
  return { value: `${pct > 0 ? "+" : ""}${pct}%` };
}
