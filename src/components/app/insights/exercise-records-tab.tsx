import { Card, CardContent } from "@/components/ui/card";
import { InsightsSection } from "@/components/app/insights/insights-section";
import {
  formatDate,
  formatVolume,
  formatWeightReps,
} from "@/lib/insights/format";
import type { ExerciseRecords } from "@/lib/insights/types";

export function ExerciseRecordsTab({ records }: { records: ExerciseRecords }) {
  return (
    <div className="flex flex-col gap-6">
      <InsightsSection title="Personal records">
        <Card className="border-success/40 bg-success/5 gap-0 py-0">
          <CardContent className="flex flex-col gap-2.5 px-4 py-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">1RM</span>
              <span className="font-semibold tabular-nums">
                {records.est1RM} lb
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Best weight</span>
              <span className="font-semibold tabular-nums">
                {formatWeightReps(records.bestWeight, records.bestReps)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Max volume</span>
              <span className="font-semibold tabular-nums">
                {formatVolume(records.maxVolume)}
              </span>
            </div>
          </CardContent>
        </Card>
      </InsightsSection>

      <InsightsSection title="Rep ladder">
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground text-left text-xs">
                <th className="px-3 py-2.5 font-medium">Reps</th>
                <th className="px-3 py-2.5 font-medium">Best performance</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Predicted
                </th>
              </tr>
            </thead>
            <tbody>
              {records.repLadder.map((entry, i) => (
                <tr
                  key={entry.reps}
                  className={i % 2 === 1 ? "bg-muted/20" : undefined}
                >
                  <td className="px-3 py-2.5 tabular-nums">{entry.reps}</td>
                  <td className="px-3 py-2.5">
                    {entry.bestWeight != null && entry.bestReps != null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold tabular-nums">
                          {entry.bestWeight} lb (×{entry.bestReps})
                        </span>
                        {entry.bestDate != null ? (
                          <span className="text-muted-foreground text-xs">
                            {formatDate(entry.bestDate)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {entry.predicted} lb
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InsightsSection>
    </div>
  );
}
