import { EditTemplateLoader } from "@/components/app/edit-template-loader";

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditTemplateLoader id={id} />;
}
