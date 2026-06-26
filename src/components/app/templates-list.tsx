"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Dumbbell, History, Pencil, Plus } from "lucide-react";

import { api } from "@backend/api";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StartWorkoutButton } from "@/components/app/start-workout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";

function summarize(
  exercises: { slug: string; setCount: number }[],
  short: (slug: string) => string,
): string {
  if (exercises.length === 0) return "No exercises";
  return exercises.map((e) => `${short(e.slug)} ${e.setCount}`).join(" · ");
}

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
          <Button asChild size="sm">
            <Link href="/templates/new">
              <Plus className="size-4" />
              New
            </Link>
          </Button>
        }
      />

      {templates === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Create your first template"
          description="Build a multi-exercise routine, then start a workout from it."
          action={
            <Button asChild>
              <Link href="/templates/new">
                <Plus className="size-4" />
                New template
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <Card key={t._id}>
              <CardHeader>
                <CardTitle className="text-base">{t.name}</CardTitle>
                <p className="text-muted-foreground text-sm">
                  {summarize(t.exercises, catalog.short)}
                </p>
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
