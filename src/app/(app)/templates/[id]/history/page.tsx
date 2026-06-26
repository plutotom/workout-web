import { TemplateHistory } from "@/components/app/template-history";

export default async function TemplateHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TemplateHistory id={id} />;
}
