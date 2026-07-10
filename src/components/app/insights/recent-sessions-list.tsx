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
    <div className="flex min-w-0 flex-col gap-2">
      {sessions.map((s) => (
        <Link
          key={s.id}
          href={`/workout/${s.id}`}
          className="group min-w-0 overflow-hidden rounded-lg border bg-[var(--surface)] p-3 transition-all active:scale-[0.98]"
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-sm font-semibold">{s.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {formatDate(s.completedAt)} ·{" "}
                {formatDuration(s.durationMinutes)} · {formatVolume(s.volumeLb)}
              </p>
              <p className="mt-1 line-clamp-2 text-xs break-words text-muted-foreground/80">
                {s.summary}
              </p>
            </div>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5" />
          </div>
        </Link>
      ))}
    </div>
  );
}
