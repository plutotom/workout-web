"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { ChevronRight, Dumbbell, Play } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { exerciseShort, type ExerciseSlug } from "@/lib/exercises";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function summarize(exercises: { slug: string; setCount: number }[]): string {
  if (exercises.length === 0) return "No exercises";
  return exercises
    .map((e) => `${exerciseShort(e.slug as ExerciseSlug)} ${e.setCount}`)
    .join(" · ");
}

export default function DashboardPage() {
  const active = useQuery(api.routes.workouts.queries.active);
  const recent = useQuery(api.routes.workouts.queries.recent);
  const templates = useQuery(api.routes.templates.queries.list);

  const total = recent?.total ?? 0;
  const hasTemplates = (templates?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {total > 0
            ? `${total} workout${total === 1 ? "" : "s"} logged`
            : "Let's get the first one in."}
        </p>
      </div>

      {/* In-progress workout takes priority; otherwise a primary start CTA. */}
      {active ? (
        <Card className="border-success/40 bg-success/5">
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
      ) : (
        <Button asChild size="lg" className="w-full">
          <Link href="/templates">
            <Play className="size-4" />
            {hasTemplates ? "Start a workout" : "Create your first template"}
          </Link>
        </Button>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Recent workouts</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/templates">
              <Dumbbell className="size-4" />
              Templates
            </Link>
          </Button>
        </div>

        {recent === undefined ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : recent.sessions.length === 0 ? (
          <EmptyState
            title="No workouts yet"
            description="Start a workout from a template and it'll show up here."
          />
        ) : (
          recent.sessions.map((s) => (
            <Link key={s._id} href={`/workout/${s._id}`}>
              <Card className="flex-row items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{s.templateName}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {formatDate(s.completedAt)} · {summarize(s.exercises)}
                  </p>
                </div>
                <ChevronRight className="text-muted-foreground size-5 shrink-0" />
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
