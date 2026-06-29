"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TemplateEditorForm } from "@/components/app/template-editor-form";

export function EditTemplateLoader({ id }: { id: string }) {
  const templateId = id as Id<"workoutTemplates">;
  const template = useQuery(api.routes.templates.queries.get, { templateId });

  if (template === undefined) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Edit template" backHref="/templates" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Edit template" backHref="/templates" />
        <EmptyState
          title="Template not found"
          description="It may have been deleted."
        />
      </div>
    );
  }

  // Mounted only once data is present, so the form's initial state is correct
  // without syncing server data via an effect.
  return (
    <TemplateEditorForm
      templateId={template._id}
      initial={{
        name: template.name,
        exercises: template.exercises.map((e) => ({
          slug: e.slug,
          sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          notes: e.notes,
        })),
      }}
    />
  );
}
