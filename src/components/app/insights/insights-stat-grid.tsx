import { Card, CardContent } from "@/components/ui/card";
import { formatDuration, formatVolume } from "@/lib/insights/format";
import type { OverviewStats } from "@/lib/insights/types";

export function InsightsStatGrid({ stats }: { stats: OverviewStats }) {
  const items = [
    { value: String(stats.workouts), label: "workouts" },
    { value: formatDuration(stats.durationMinutes), label: "total time" },
    {
      value: formatVolume(stats.volumeLb).replace(" lb", ""),
      label: "lb volume",
    },
    { value: String(stats.streakWeeks), label: "wk streak" },
  ] as const;

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="grid grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.label} className="flex flex-col gap-0.5">
              <span className="text-2xl font-semibold tabular-nums">
                {item.value}
              </span>
              <span className="text-muted-foreground text-xs">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
