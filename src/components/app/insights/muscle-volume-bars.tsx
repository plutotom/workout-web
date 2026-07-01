"use client";

import { cn } from "@/lib/utils";
import { formatVolume } from "@/lib/insights/format";
import type { MuscleVolume } from "@/lib/insights/types";

export function MuscleVolumeBars({
  muscles,
  activeId,
  onSelect,
}: {
  muscles: MuscleVolume[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {muscles.map((m) => {
        const active = activeId === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(active ? null : m.id)}
            className={cn(
              "flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-all active:scale-[0.98]",
              active
                ? "border-success/40 bg-success/5"
                : "border-border/40 bg-transparent hover:border-border/70 hover:bg-card/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-sm font-medium",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {m.label}
              </span>
              <span
                className={cn(
                  "text-sm tabular-nums",
                  active ? "text-foreground/80" : "text-muted-foreground/70",
                )}
              >
                {m.pct}%
              </span>
            </div>
            <div className="bg-muted/60 h-1.5 overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  active ? "bg-success" : "bg-foreground/30",
                )}
                style={{ width: `${m.pct}%` }}
              />
            </div>
            <span
              className={cn(
                "text-xs",
                active ? "text-muted-foreground" : "text-muted-foreground/60",
              )}
            >
              {formatVolume(m.volumeLb)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
