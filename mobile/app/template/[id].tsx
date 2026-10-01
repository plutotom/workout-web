import { api } from "@backend/api";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";

import { useMobileAuth } from "@/auth/auth-provider";
import { TemplateEditor } from "@/components/templates/template-editor";
import { FullScreenLoader } from "@/components/ui";
import { useLocalTemplate } from "@/data/local/provider";
import {
  convexWorkoutTemplateIdForQuery,
  isLocalTemplateRouteId,
} from "@/data/local/types";
import { isTemplateAiQuery } from "@/lib/ai-routes";

export default function TemplateEditorScreen() {
  const { id, ai } = useLocalSearchParams<{ id: string; ai?: string }>();
  const templateId = id === "new" ? undefined : id;
  const { isAuthenticated } = useMobileAuth();
  const localTemplate = useLocalTemplate(templateId);
  const remoteTemplateId = templateId
    ? convexWorkoutTemplateIdForQuery(templateId, localTemplate)
    : null;
  const remoteTemplate = useQuery(
    api.routes.templates.queries.get,
    isAuthenticated && remoteTemplateId
      ? { templateId: remoteTemplateId }
      : "skip",
  );

  if (templateId) {
    const waitingForLocal =
      isLocalTemplateRouteId(templateId) && localTemplate === undefined;
    if (waitingForLocal) {
      return <FullScreenLoader label="Loading template…" />;
    }
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
      openAi={isTemplateAiQuery(ai)}
    />
  );
}
