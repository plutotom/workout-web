/**
 * OpenAI Structured Outputs (strict) requires, for every object node:
 * - `additionalProperties: false`
 * - `required` listing every key in `properties`
 *
 * See: https://platform.openai.com/docs/guides/structured-outputs
 * AI SDK troubleshooting: avoid `.optional()` / `.nullish()` / `.default()` that
 * omit fields from `required`. Prefer `.nullable()` when a value may be null.
 */

export type JsonSchemaNode = {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean | JsonSchemaNode;
  items?: JsonSchemaNode | JsonSchemaNode[];
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  allOf?: JsonSchemaNode[];
  [key: string]: unknown;
};

export function collectOpenAiStrictSchemaIssues(
  schema: JsonSchemaNode,
  path = "$",
): string[] {
  const issues: string[] = [];

  const visit = (node: JsonSchemaNode | undefined, at: string) => {
    if (!node || typeof node !== "object") return;

    if (node.properties && Object.keys(node.properties).length > 0) {
      const props = Object.keys(node.properties);
      if (!Array.isArray(node.required)) {
        issues.push(`${at}: missing required array`);
      } else {
        const missing = props.filter((key) => !node.required!.includes(key));
        if (missing.length > 0) {
          issues.push(
            `${at}: required must include every property key (missing: ${missing.join(", ")})`,
          );
        }
      }
      if (node.additionalProperties !== false) {
        issues.push(
          `${at}: additionalProperties must be false (got ${JSON.stringify(node.additionalProperties)})`,
        );
      }
      for (const [key, child] of Object.entries(node.properties)) {
        visit(child, `${at}.${key}`);
      }
    }

    if (node.items) {
      if (Array.isArray(node.items)) {
        node.items.forEach((child, i) => visit(child, `${at}.items[${i}]`));
      } else {
        visit(node.items, `${at}.items`);
      }
    }

    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      const variants = node[key];
      if (!Array.isArray(variants)) continue;
      variants.forEach((child, i) => visit(child, `${at}.${key}[${i}]`));
    }
  };

  visit(schema, path);
  return issues;
}

export function assertOpenAiStrictJsonSchema(
  schema: JsonSchemaNode,
  label = "schema",
): void {
  const issues = collectOpenAiStrictSchemaIssues(schema);
  if (issues.length > 0) {
    throw new Error(
      `${label} is not OpenAI-strict compatible:\n- ${issues.join("\n- ")}`,
    );
  }
}
