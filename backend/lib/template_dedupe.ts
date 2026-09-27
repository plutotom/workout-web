export type DuplicateTemplateRow = {
  id: string;
  name: string;
  createdAt: number;
  slugs: string[];
};

export type DuplicateTemplatePlan = {
  keepId: string;
  deleteIds: string[];
};

function duplicateKey(row: DuplicateTemplateRow) {
  return `${row.name.trim().toLowerCase()}\0${row.slugs.join("\0")}`;
}

/**
 * Keep the oldest row in each exact name+exercise-slug group. Newer copies
 * from the iOS create-retry loop are the ones to drop.
 */
export function duplicateTemplatePlan(
  rows: DuplicateTemplateRow[],
): DuplicateTemplatePlan[] {
  const groups = new Map<string, DuplicateTemplateRow[]>();
  for (const row of rows) {
    const key = duplicateKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const plan: DuplicateTemplatePlan[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
    const keep = sorted[0];
    if (!keep) continue;
    plan.push({
      keepId: keep.id,
      deleteIds: sorted.slice(1).map((row) => row.id),
    });
  }
  return plan;
}
