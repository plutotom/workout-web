export const NEW_TEMPLATE_AI_HREF = {
  pathname: "/template/[id]",
  params: { id: "new", ai: "1" },
} as const;

export function isTemplateAiQuery(
  value: string | string[] | undefined,
): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "1" || raw === "true";
}
