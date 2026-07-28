import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";

import { useMobileAuth } from "@/auth/auth-provider";
import { TemplateEditor } from "@/components/templates/template-editor";
import { FullScreenLoader } from "@/components/ui";
import { useLocalTemplate } from "@/data/local/provider";

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const templateId = id === "new" ? undefined : id;
  const { isAuthenticated } = useMobileAuth();
  const localTemplate = useLocalTemplate(templateId);
  const remoteTemplate = useQuery(
    api.routes.templates.queries.get,
    isAuthenticated && templateId
      ? { templateId: templateId as Id<"workoutTemplates"> }
      : "skip",
  );

  if (templateId) {
    if (
      isAuthenticated &&
      remoteTemplate === undefined &&
      localTemplate === undefined
    ) {
      return <FullScreenLoader label="Loading template…" />;
    }
    if (!isAuthenticated && localTemplate === undefined) {
      return <FullScreenLoader label="Loading template…" />;
    }
  }

  const source = remoteTemplate ?? localTemplate;
  const initial = source
    ? {
        name: source.name,
        exercises: source.exercises.map((exercise) => ({
          slug: exercise.slug,
          sets: exercise.sets,
        })),
      }
    : { name: "", exercises: [] };

  return (
    <TemplateEditor
      key={templateId ?? "new"}
      templateId={templateId}
      initial={initial}
    />
  );
}
