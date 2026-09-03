import { Dumbbell, History } from "lucide-react";
import Link from "next/link";

import type { InsightsDays } from "@/lib/insights/format";

export function InsightsHubTiles({ days }: { days: InsightsDays }) {
  const tiles = [
    {
      href: "/exercises",
      label: "Exercises",
      hint: "Catalog & customs",
      icon: Dumbbell,
    },
    {
      href: `/insights/sessions?days=${days}`,
      label: "History",
      hint: "Logged sessions",
      icon: History,
    },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map(({ href, label, hint, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-h-[5.5rem] flex-col justify-between rounded-xl border bg-[var(--surface)] p-4 transition-transform active:scale-[0.98]"
        >
          <Icon className="size-5" />
          <span>
            <span className="block text-sm font-semibold">{label}</span>
            <span className="text-muted-foreground block text-xs">{hint}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
