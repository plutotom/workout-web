"use client";

import { cn } from "@/lib/utils";
import { formatVolume } from "@/lib/insights/format";
import type { MuscleVolume } from "@/lib/insights/types";

const shades = [
  "bg-[var(--g1)]",
  "bg-[var(--g2)]",
  "bg-[var(--g3)]",
  "bg-[var(--g4)]",
  "bg-[var(--faint)]",
  "bg-[var(--surface-2)]",
];

export function MuscleVolumeBars({
  muscles,
  activeId,
  onSelect,
}: {
  muscles: MuscleVolume[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  if (muscles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Muscle balance will appear after completed weighted sets.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex h-4 min-w-0 overflow-hidden rounded-full bg-muted">
        {muscles.map((m, index) => (
          <button
            key={m.id}
            type="button"
            aria-label={`${m.label} ${m.pct}%`}
            onClick={() => onSelect(activeId === m.id ? null : m.id)}
            className={cn(
              "h-full min-w-1 transition-opacity",
              shades[index % shades.length],
              activeId && activeId !== m.id && "opacity-35",
            )}
            style={{ width: `${Math.max(m.pct, 4)}%` }}
          />
        ))}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        {muscles.map((m, index) => {
          const active = activeId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(active ? null : m.id)}
              className={cn(
                "flex w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-all active:scale-[0.98]",
                active
                  ? "border-foreground/50 bg-foreground/5"
                  : "border-border/40 bg-transparent hover:border-border/70 hover:bg-card/40",
              )}
            >
              <span className="flex min-w-0 items-center gap-2 overflow-hidden">
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    shades[index % shades.length],
                  )}
                />
                <span className="truncate text-sm font-medium">{m.label}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">
                  {m.pct}%
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatVolume(m.volumeLb)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
