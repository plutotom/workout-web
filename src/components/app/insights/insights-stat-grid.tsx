import { Activity, Clock, Flame, Repeat } from "lucide-react";

import { formatDuration, formatVolume } from "@/lib/insights/format";
import type { OverviewStats } from "@/lib/insights/types";

export function InsightsStatGrid({ stats }: { stats: OverviewStats }) {
  const items = [
    { value: String(stats.workouts), label: "Workouts", icon: Activity },
    {
      value: formatDuration(stats.durationMinutes),
      label: "Time",
      icon: Clock,
    },
    {
      value: formatVolume(stats.volumeLb),
      label: "Volume",
      icon: Flame,
    },
    { value: `${stats.streakWeeks} wk`, label: "Streak", icon: Repeat },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(({ icon: Icon, ...item }, index) => (
        <div
          key={item.label}
          className="animate-rise-in rounded-lg border bg-[var(--surface)] p-4"
          style={{ animationDelay: `${index * 45}ms` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {item.label}
            </span>
            <Icon className="size-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
