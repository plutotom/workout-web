import {
  formatHealthSegmentRows,
  type HealthWorkoutSegment,
} from "@/lib/health-summary";
import { cn } from "@/lib/utils";

export function HealthSegmentList({
  segments,
  unit = "lb",
}: {
  segments: HealthWorkoutSegment[] | null | undefined;
  unit?: "lb" | "kg";
}) {
  const rows = formatHealthSegmentRows(segments, unit);
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li
          key={row.key}
          className={cn(
            "flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5",
            row.isTransition && "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "text-[15px]",
              row.isTransition ? "font-medium" : "font-semibold",
            )}
          >
            {row.name}
          </span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {row.facts}
          </span>
        </li>
      ))}
    </ul>
  );
}
