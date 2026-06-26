"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  "aria-label"?: string;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label={ariaLabel}
    >
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-8"
        disabled={value <= min}
        aria-label="Decrease"
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-4" />
      </Button>
      <span className="w-7 text-center text-sm tabular-nums">{value}</span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="size-8"
        disabled={value >= max}
        aria-label="Increase"
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
