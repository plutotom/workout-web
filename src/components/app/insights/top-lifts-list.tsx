"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, ChevronRight } from "lucide-react";

import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { cn } from "@/lib/utils";
import type { TopLift } from "@/lib/insights/types";
import type { InsightsDays } from "@/lib/insights/format";

function TrendIcon({ trend }: { trend: TopLift["trend"] }) {
  const Icon =
    trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : ArrowRight;
  return (
    <Icon
      className={cn(
        "size-3.5 shrink-0",
        trend === "up" && "text-success",
        trend === "down" && "text-destructive",
        trend === "flat" && "text-muted-foreground",
      )}
      aria-hidden
    />
  );
}

export function TopLiftsList({
  lifts,
  days,
}: {
  lifts: TopLift[];
  days: InsightsDays;
}) {
  const catalog = useExerciseCatalog();

  if (lifts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No lifts in this muscle group for the selected period.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {lifts.map((lift, index) => (
        <Link
          key={lift.slug}
          href={`/insights/exercise/${lift.slug}?days=${days}`}
          className="group rounded-lg border bg-[var(--surface)] p-3 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-sm font-semibold tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">
                  {catalog.name(lift.slug)}
                </p>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  <TrendIcon trend={lift.trend} />
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {lift.sessions} session{lift.sessions === 1 ? "" : "s"} · est.
                1RM {lift.est1RM} lb
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold tabular-nums">
                {lift.weight}
              </p>
              <p className="text-xs text-muted-foreground">lb</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5" />
          </div>
        </Link>
      ))}
    </div>
  );
}
