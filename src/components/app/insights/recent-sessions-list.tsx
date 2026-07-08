import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
    <div className="grid gap-2">
      {sessions.map((s) => (
        <Link
          key={s.id}
          href={`/workout/${s.id}`}
          className="group rounded-lg border bg-[var(--surface)] p-3 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{s.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDate(s.completedAt)} ·{" "}
                {formatDuration(s.durationMinutes)} · {formatVolume(s.volumeLb)}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground/80">
                {s.summary}
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5" />
          </div>
        </Link>
      ))}
    </div>
  );
}
