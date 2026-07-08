import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightsSection } from "@/components/app/insights/insights-section";
import {
  estimate1RM,
  formatDateTime,
  formatMonthYear,
  formatWeightReps,
} from "@/lib/insights/format";
import type { ExerciseSession, ExerciseSet } from "@/lib/insights/types";

type SetRow = {
  index: number;
  label: string;
  est1RM: string;
};

function collapseSets(sets: ExerciseSet[]): SetRow[] {
  const bestIdx = sets.reduce((best, set, i) => {
    const est = estimate1RM(set.weight, set.reps);
    const bestEst = estimate1RM(sets[best].weight, sets[best].reps);
    return est > bestEst ? i : best;
  }, 0);

  return sets.map((set, i) => ({
    index: i + 1,
    label: formatWeightReps(set.weight, set.reps),
    est1RM: i === bestIdx ? String(estimate1RM(set.weight, set.reps)) : "",
  }));
}

function sessionBest(session: ExerciseSession) {
  if (session.bestEst1RM > 0) {
    const bestSet = session.sets.reduce((best, set) => {
      const est = estimate1RM(set.weight, set.reps);
      const bestEst = estimate1RM(best.weight, best.reps);
      return est > bestEst ? set : best;
    }, session.sets[0]);
    return { set: bestSet, est1RM: session.bestEst1RM };
  }
  return sessionBestFromSets(session.sets);
}

function sessionBestFromSets(sets: ExerciseSet[]) {
  let best = sets[0];
  let bestEst = estimate1RM(best.weight, best.reps);
  for (const set of sets) {
    const est = estimate1RM(set.weight, set.reps);
    if (est > bestEst) {
      best = set;
      bestEst = est;
    }
  }
  return { set: best, est1RM: bestEst };
}

function groupByMonth(sessions: ExerciseSession[]) {
  const groups = new Map<string, ExerciseSession[]>();
  for (const session of sessions) {
    const key = formatMonthYear(session.completedAt);
    const list = groups.get(key) ?? [];
    list.push(session);
    groups.set(key, list);
  }
  return Array.from(groups.entries());
}

function SetTable({ sets }: { sets: ExerciseSet[] }) {
  const rows = collapseSets(sets);

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left text-xs">
            <th className="pb-2 pr-3 font-medium">#</th>
            <th className="pb-2 pr-3 font-medium">Weight × Reps</th>
            <th className="pb-2 text-right font-medium">est 1RM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.index} className="border-border/50 border-t">
              <td className="text-muted-foreground py-2 pr-3 tabular-nums">
                {row.index}
              </td>
              <td className="py-2 pr-3 tabular-nums">{row.label}</td>
              <td className="py-2 text-right tabular-nums">{row.est1RM}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExerciseHistoryTab({
  sessions,
}: {
  sessions: ExerciseSession[];
}) {
  const groups = groupByMonth(sessions);

  if (sessions.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No logged sets for this exercise yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([month, monthSessions]) => (
        <div key={month} className="flex flex-col gap-2">
          <InsightsSection title={month}>
            <div className="flex flex-col gap-2">
              {monthSessions.map((session) => {
                const hasMultipleSets = session.sets.length > 1;
                const best = sessionBest(session);

                return (
                  <Card
                    key={session.id}
                    className="gap-0 bg-[var(--surface)] py-0"
                  >
                    <CardHeader className="border-border/50 border-b px-4 py-3">
                      <CardTitle className="text-sm font-medium">
                        {session.workoutName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 py-3">
                      <p className="text-muted-foreground text-xs">
                        {formatDateTime(session.completedAt)}
                      </p>
                      {hasMultipleSets ? (
                        <SetTable sets={session.sets} />
                      ) : (
                        <p className="mt-2 text-sm">
                          Best:{" "}
                          <span className="font-semibold tabular-nums">
                            {formatWeightReps(best.set.weight, best.set.reps)}
                          </span>{" "}
                          <span className="text-muted-foreground text-xs">
                            (est. 1RM {best.est1RM})
                          </span>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </InsightsSection>
        </div>
      ))}
    </div>
  );
}
