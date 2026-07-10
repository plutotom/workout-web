"use client";

import { cn } from "@/lib/utils";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/exercises";

export type MuscleSegment = {
  id: MuscleGroup;
  label: string;
  value: number;
  pct: number;
};

const bandShades = [
  "bg-[var(--g1)]",
  "bg-[var(--g2)]",
  "bg-[var(--g3)]",
  "bg-[var(--g4)]",
  "bg-[var(--faint)]",
  "bg-[var(--surface-2)]",
];

export function formatLb(value: number): string {
  return `${Math.round(value).toLocaleString()} lb`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function estimateWorkoutMinutes(
  exerciseCount: number,
  setCount: number,
) {
  return setCount * 3 + exerciseCount * 2;
}

export function buildMuscleSegments(
  items: {
    slug: string;
    sets: number;
    category: (slug: string) => MuscleGroup | undefined;
  }[],
): MuscleSegment[] {
  const byGroup = new Map<MuscleGroup, number>();
  for (const item of items) {
    const group = item.category(item.slug);
    if (!group) continue;
    byGroup.set(group, (byGroup.get(group) ?? 0) + item.sets);
  }
  const total = Array.from(byGroup.values()).reduce((sum, v) => sum + v, 0);
  return MUSCLE_GROUPS.map((g) => {
    const value = byGroup.get(g.id) ?? 0;
    return {
      id: g.id,
      label: g.label,
      value,
      pct: total > 0 ? Math.round((value / total) * 100) : 0,
    };
  }).filter((segment) => segment.value > 0);
}

export function MuscleBand({
  segments,
  className,
  showLegend = false,
}: {
  segments: MuscleSegment[];
  className?: string;
  showLegend?: boolean;
}) {
  const fallback = segments.length === 0;

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
        {fallback ? (
          <span className="h-full w-full bg-[var(--faint)]/30" />
        ) : (
          segments.map((segment, index) => (
            <span
              key={segment.id}
              className={cn(
                "h-full min-w-1",
                bandShades[index % bandShades.length],
              )}
              style={{ width: `${Math.max(segment.pct, 4)}%` }}
              title={`${segment.label} ${segment.pct}%`}
            />
          ))
        )}
      </div>
      {showLegend && !fallback ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((segment, index) => (
            <span
              key={segment.id}
              className="text-[11px] font-medium text-[var(--dim)]"
            >
              <span
                className={cn(
                  "mr-1 inline-block size-2 rounded-full align-[-1px]",
                  bandShades[index % bandShades.length],
                )}
              />
              {segment.label} {segment.pct}%
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MiniSparkline({
  className,
  values,
}: {
  className?: string;
  values?: number[];
}) {
  const path = sparklinePath(values);

  return (
    <svg
      viewBox="0 0 120 40"
      className={cn("h-full w-full overflow-visible", className)}
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
        pathLength={160}
        className="animate-line-draw"
      />
    </svg>
  );
}

function sparklinePath(values: number[] | undefined): string {
  const usable = values && values.length > 0 ? values : [0, 0, 0, 0, 0, 0, 0];
  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const range = max - min || 1;
  const width = 116;
  const height = 32;
  const points = usable.map((value, index) => {
    const x =
      2 + (usable.length === 1 ? 0 : (index / (usable.length - 1)) * width);
    const y = 36 - ((value - min) / range) * height;
    return { x, y };
  });

  if (points.length === 1) {
    return `M2 ${points[0].y} L118 ${points[0].y}`;
  }

  return points
    .map((point, index) =>
      index === 0 ? `M${point.x} ${point.y}` : `L${point.x} ${point.y}`,
    )
    .join(" ");
}

export function ProgressRing({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const circumference = 2 * Math.PI * 18;

  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 48 48" className="-rotate-90">
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth="6"
        />
        <circle
          cx="24"
          cy="24"
          r="18"
          fill="none"
          stroke="var(--action)"
          strokeLinecap="round"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-semibold">
        {label}
      </span>
    </div>
  );
}
