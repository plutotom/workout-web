import { TemplatePreview } from "@/components/app/template-preview";

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TemplatePreview id={id} />;
}
