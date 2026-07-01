export type InsightsDays = "7" | "30" | "90" | "all";

export const INSIGHTS_DAY_OPTIONS: { value: InsightsDays; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "all", label: "All" },
];

export type InsightsDaysArg = 7 | 30 | 90 | null;

export function insightsDaysToArg(days: InsightsDays): InsightsDaysArg {
  if (days === "all") return null;
  return Number(days) as 7 | 30 | 90;
}

export function parseInsightsDaysParam(
  value: string | undefined,
): InsightsDays {
  if (value === "7" || value === "30" || value === "90" || value === "all") {
    return value;
  }
  return "30";
}

/** Format weight × reps volume in pounds. */
export function formatVolume(lb: number): string {
  if (lb >= 1000) {
    const k = lb / 1000;
    const formatted = k % 1 === 0 ? k.toFixed(0) : k.toFixed(1);
    return `${formatted}k lb`;
  }
  return `${Math.round(lb).toLocaleString()} lb`;
}

/** Format duration from total minutes. */
export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatDate(ts: number | Date): string {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(ts: number | Date): string {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

export function formatMonthYear(ts: number | Date): string {
  const d = typeof ts === "number" ? new Date(ts) : ts;
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Epley formula: weight × (1 + reps / 30). */
export function estimate1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

/** Reverse Epley: predicted weight for a target rep count given a 1RM. */
export function predictedWeight(oneRm: number, reps: number): number {
  if (oneRm <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(oneRm);
  return Math.round(oneRm / (1 + reps / 30));
}

export function formatWeightReps(weight: number, reps: number): string {
  return `${weight} × ${reps}`;
}
