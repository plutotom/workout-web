"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Dumbbell, History, Pencil, Plus } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StartWorkoutButton } from "@/components/app/start-workout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";

function formatLast(ts: number | null): string {
  if (!ts) return "No sessions yet";
  return `Last: ${new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export function TemplatesList() {
  const catalog = useExerciseCatalog();
  const templates = useQuery(api.routes.templates.queries.list);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Templates"
        action={
          <div className="flex items-center gap-2">
            <StartWorkoutButton
              mode="blank"
              variant="outline"
              label="Quick start"
              className="w-auto"
            />
            <Button asChild size="sm">
              <Link href="/templates/new">
                <Plus className="size-4" />
                New
              </Link>
            </Button>
          </div>
        }
      />

      {templates === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No templates yet"
          description="Quick start a workout and save it when you're done, or build a template first."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <StartWorkoutButton
                mode="blank"
                label="Quick start"
                className="w-auto"
              />
              <Button asChild variant="outline">
                <Link href="/templates/new">
                  <Plus className="size-4" />
                  New template
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <Card key={t._id} className="overflow-hidden bg-[var(--surface)]">
              <CardHeader>
                <CardTitle className="text-base">{t.name}</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  {t.exercises.slice(0, 4).map((exercise) => (
                    <span
                      key={exercise.slug}
                      className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                    >
                      {catalog.short(exercise.slug)}
                    </span>
                  ))}
                  {t.exercises.length > 4 ? (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      +{t.exercises.length - 4} more
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatLast(t.lastSessionAt)}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <StartWorkoutButton templateId={t._id} />
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/templates/${t._id}/edit`}>
                      <Pencil className="size-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={`/templates/${t._id}/history`}>
                      <History className="size-4" />
                      History
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
