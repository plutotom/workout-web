import type { MuscleGroup } from "@/lib/exercises";
import type { TopLift } from "@/lib/insights/types";

type QueryLift = {
  slug: string;
  sessionCount: number;
  bestWeight: number;
  est1RM: number;
  trend: TopLift["trend"];
};

export function mapQueryLifts(
  lifts: QueryLift[],
  category: (slug: string) => MuscleGroup | undefined,
): TopLift[] {
  return lifts
    .map((lift) => {
      const group = category(lift.slug);
      if (!group) return null;
      return {
        slug: lift.slug,
        weight: lift.bestWeight,
        sessions: lift.sessionCount,
        est1RM: lift.est1RM,
        trend: lift.trend,
        group,
      };
    })
    .filter((lift): lift is TopLift => lift !== null);
}
