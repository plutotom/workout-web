"use client";

import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="flex flex-col gap-1.5">
      {lifts.map((lift) => (
        <Link
          key={lift.slug}
          href={`/insights/exercise/${lift.slug}?days=${days}`}
        >
          <Card className="gap-0 py-3 transition-all duration-150 hover:border-white/20 active:scale-[0.98]">
            <CardContent className="px-4">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {catalog.name(lift.slug)}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
                  {lift.weight} lb
                  <TrendIcon trend={lift.trend} />
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {lift.sessions} session{lift.sessions === 1 ? "" : "s"} · est.
                1RM {lift.est1RM}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
