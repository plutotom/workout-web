"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { History, Pencil } from "lucide-react";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StartWorkoutButton } from "@/components/app/start-workout-button";
import { TemplateShareDialog } from "@/components/app/template-share-dialog";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { Button } from "@/components/ui/button";

export function TemplatePreview({ id }: { id: string }) {
  const catalog = useExerciseCatalog();
  const templateId = id as Id<"workoutTemplates">;
  const template = useQuery(api.routes.templates.queries.get, { templateId });
  const user = useQuery(api.routes.auth.users.current);
  const unit = user?.unit ?? "lb";

  if (template === undefined) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Template" backHref="/templates" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Template" backHref="/templates" />
        <EmptyState
          title="Template not found"
          description="It may have been deleted."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={template.name} backHref="/templates" />

      <StartWorkoutButton templateId={template._id} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Exercises</h2>
        <Button asChild variant="ghost" size="sm" className="shrink-0">
          <Link href={`/templates/${template._id}/edit`}>
            <Pencil className="size-4" />
            Edit
          </Link>
        </Button>
      </div>

      {template.exercises.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No exercises yet. Edit this template to add some.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {template.exercises.map((exercise) => (
            <div
              key={exercise.slug}
              className="rounded-xl border bg-[var(--surface)] p-4"
            >
              <p className="font-medium">{catalog.name(exercise.slug)}</p>
              {exercise.notes ? (
                <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">
                  {exercise.notes}
                </p>
              ) : null}
              <div className="mt-3 overflow-hidden rounded-lg border">
                <div className="text-muted-foreground grid grid-cols-[3rem_1fr_1fr] gap-2 bg-muted/40 px-3 py-2 text-xs font-medium tracking-wide uppercase">
                  <span>Set</span>
                  <span className="text-right">{unit}</span>
                  <span className="text-right">Reps</span>
                </div>
                {exercise.sets.map((set, index) => (
                  <div
                    key={`${exercise.slug}-${index}`}
                    className="grid grid-cols-[3rem_1fr_1fr] gap-2 border-t px-3 py-2.5 text-sm"
                  >
                    <span className="text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>
                    <span className="text-right tabular-nums">
                      {set.weight > 0 ? set.weight : "—"}
                    </span>
                    <span className="text-right tabular-nums">
                      {set.reps > 0 ? set.reps : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline">
          <Link href={`/templates/${template._id}/history`}>
            <History className="size-4" />
            History
          </Link>
        </Button>
        <TemplateShareDialog templateIds={[template._id]} />
      </div>
    </div>
  );
}
