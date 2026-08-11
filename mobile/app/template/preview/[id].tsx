import { useLocalSearchParams } from "expo-router";

import { TemplatePreview } from "@/components/templates/template-preview";
import { FullScreenLoader } from "@/components/ui";

export default function TemplatePreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!id) {
    return <FullScreenLoader label="Loading template…" />;
  }

  return <TemplatePreview templateRouteId={id} />;
}
