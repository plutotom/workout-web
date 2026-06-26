import { TemplateEditorForm } from "@/components/app/template-editor-form";

export default function NewTemplatePage() {
  return <TemplateEditorForm initial={{ name: "", exercises: [] }} />;
}
