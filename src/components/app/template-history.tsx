"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { ChevronRight, History } from "lucide-react";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function summarize(
  exercises: { slug: string; completedCount: number }[],
  short: (slug: string) => string,
): string {
  const done = exercises.filter((e) => e.completedCount > 0);
  if (done.length === 0) return "No sets checked off";
  return done.map((e) => `${short(e.slug)} ${e.completedCount}`).join(" · ");
}

export function TemplateHistory({ id }: { id: string }) {
  const catalog = useExerciseCatalog();
  const templateId = id as Id<"workoutTemplates">;
  const template = useQuery(api.routes.templates.queries.get, { templateId });
  const sessions = useQuery(api.routes.workouts.queries.history, {
    templateId,
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={template ? `${template.name} history` : "History"}
        backHref="/templates"
      />

      {sessions === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={History}
          title="No sessions yet"
          description="Finished workouts from this template will appear here."
        />
      ) : (
        <div className="grid gap-2">
          {sessions.map((s) => (
            <Link
              key={s._id}
              href={`/workout/${s._id}`}
              className="group block rounded-lg"
            >
              <Card className="flex-row items-center justify-between gap-3 bg-[var(--surface)] px-4 py-3 transition-all duration-150 active:scale-[0.98]">
                <div className="min-w-0">
                  <p className="font-medium">{formatDate(s.completedAt)}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {summarize(s.exercises, catalog.short)}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
