/** Characters allowed while typing a weight expression. */
export function sanitizeWeightDraft(raw: string): string {
  return raw.replace(/[^0-9+\s]/g, "");
}

/**
 * Parse a lift weight field: plain integers or addition chains (e.g. "45+45+5" → 95).
 * Returns null for invalid expressions.
 */
export function parseLiftNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;

  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, parseInt(trimmed, 10));
  }

  if (!/^[\d+\s]+$/.test(trimmed)) return null;

  const parts = trimmed.split("+");
  if (parts.some((part) => part.trim() === "")) return null;

  let sum = 0;
  for (const part of parts) {
    const n = parseInt(part.trim(), 10);
    if (Number.isNaN(n)) return null;
    sum += n;
  }

  return Math.max(0, sum);
}

/** Resolved weight for plate calc: evaluate draft, fall back to committed value. */
export function effectiveLiftWeight(draft: string, committed: number): number {
  return parseLiftNumber(draft) ?? committed;
}
