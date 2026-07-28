import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { TemplateImportPanel } from "@/components/app/template-import-panel";

export const metadata: Metadata = { title: "Import" };

export default function ImportTemplatesPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Import workouts"
        description="Bring in templates from a .json file or a pasted share code."
        backHref="/templates"
      />
      <TemplateImportPanel />
    </div>
  );
}
