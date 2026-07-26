import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";

import { TemplateEditor } from "@/components/templates/template-editor";
import { FullScreenLoader } from "@/components/ui";

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const templateId = id === "new" ? undefined : (id as Id<"workoutTemplates">);
  const template = useQuery(
    api.routes.templates.queries.get,
    templateId ? { templateId } : "skip",
  );

  if (templateId && template === undefined)
    return <FullScreenLoader label="Loading template…" />;
  const initial = template ?? { name: "", exercises: [] };
  return (
    <TemplateEditor
      key={templateId ?? "new"}
      templateId={templateId}
      initial={{
        name: initial.name,
        exercises: initial.exercises.map((exercise) => ({
          slug: exercise.slug,
          sets: exercise.sets,
        })),
      }}
    />
  );
}
