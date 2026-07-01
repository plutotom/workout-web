import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatDate,
  formatDuration,
  formatVolume,
} from "@/lib/insights/format";
import type { RecentSession } from "@/lib/insights/types";

export function RecentSessionsList({
  sessions,
}: {
  sessions: RecentSession[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {sessions.map((s) => (
        <Link key={s.id} href={`/workout/${s.id}`}>
          <Card className="gap-0 py-3 transition-all duration-150 hover:border-white/20 active:scale-[0.98]">
            <CardContent className="px-4">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {formatDate(s.completedAt)} ·{" "}
                {formatDuration(s.durationMinutes)} · {formatVolume(s.volumeLb)}
              </p>
              <p className="text-muted-foreground/80 mt-1 text-xs">
                {s.summary}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
