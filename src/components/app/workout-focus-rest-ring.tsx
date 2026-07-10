"use client";

import { Button } from "@/components/ui/button";
import { formatClock, type RestState } from "@/lib/workout-rest";

const RING_SIZE = 240;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Full-screen rest overlay for the Focus view. Rest is a moment — the set
 * card underneath is intentionally blocked until the ring drains or is
 * skipped.
 */
export function RestRing({
  rest,
  remaining,
  onAddSeconds,
  onSkip,
}: {
  rest: RestState;
  remaining: number;
  onAddSeconds: (seconds: number) => void;
  onSkip: () => void;
}) {
  const progress = rest.seconds > 0 ? remaining / rest.seconds : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-background/95 px-6 backdrop-blur">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        Rest
      </p>

      <div className="relative">
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="-rotate-90"
          aria-hidden
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            className="stroke-muted"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            className="stroke-foreground transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-mono text-5xl font-semibold tabular-nums">
            {formatClock(remaining)}
          </p>
        </div>
      </div>

      <p className="max-w-full truncate text-base font-medium">
        Next · {rest.label}
      </p>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => onAddSeconds(15)}
        >
          +15s
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onSkip}>
          Skip
        </Button>
      </div>
    </div>
  );
}
