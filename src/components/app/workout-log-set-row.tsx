"use client";

import { useState, type ComponentProps } from "react";
import { useMutation } from "convex/react";
import { Check, X } from "lucide-react";
import { api } from "@backend/api";
import type { Doc } from "@backend/dataModel";
import { LiftWeightInput } from "@/components/app/lift-weight-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/haptics";

export function WorkoutLogSetRow({
  exerciseSlug,
  ...props
}: ComponentProps<typeof SetRowFields> & { exerciseSlug: string }) {
  // Database identity survives replacement; input and optimistic UI state do not.
  return <SetRowFields key={`${exerciseSlug}:${props.set._id}`} {...props} />;
}

function selectNumericInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

function SetRowFields({
  set,
  index,
  editable,
  canDelete,
  includeBar,
  onDelete,
  highlighted,
  onLogged,
}: {
  set: Doc<"sets">;
  index: number;
  editable: boolean;
  canDelete: boolean;
  includeBar: boolean;
  onDelete: () => void;
  highlighted: boolean;
  onLogged: () => void;
}) {
  const updateSet = useMutation(api.routes.workouts.mutations.updateSet);
  // Optimistic checkmark so the toggle flips instantly on tap (both ways),
  // independent of the mutation round-trip.
  const [pendingCompleted, setPendingCompleted] = useState<boolean | null>(
    null,
  );
  const completed = pendingCompleted ?? set.completed;
  // Drives the one-shot celebration (halo + spring). Only set on a real tap, so
  // already-completed sets don't all animate when the screen loads.
  const [celebrate, setCelebrate] = useState(false);

  function toggleCompleted() {
    const next = !completed;
    setPendingCompleted(next);
    if (next) {
      // A little tactile reward for ticking a set off; nothing on un-checking.
      hapticTap();
      setCelebrate(true);
      onLogged();
    } else {
      setCelebrate(false);
    }
    void updateSet({ setId: set._id, completed: next }).catch(() =>
      setPendingCompleted(null),
    );
  }

  function commitReps(raw: string) {
    const value = raw.trim() === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(value) || value === set.reps) return;
    void updateSet({ setId: set._id, reps: value });
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[2rem_1fr_auto_1fr_2.5rem_2.5rem] items-center gap-2 rounded-md border px-1 py-1.5 transition-colors duration-200",
        highlighted
          ? "border-foreground/40 bg-foreground/5"
          : "border-transparent",
        completed && "border-success/40 bg-success/10",
      )}
    >
      <span className="text-muted-foreground text-sm tabular-nums">
        {index}
      </span>
      <LiftWeightInput
        value={set.weight}
        disabled={!editable}
        inputClassName="h-9 text-center"
        aria-label={`Set ${index} weight`}
        onCommit={(weight) => {
          if (weight !== set.weight) {
            void updateSet({ setId: set._id, weight });
          }
        }}
        plateCalc={
          editable
            ? {
                includeBar,
                onApply: (weight) => {
                  if (weight !== set.weight) {
                    void updateSet({ setId: set._id, weight });
                  }
                },
                buttonAriaLabel: `Plates for set ${index}`,
              }
            : { includeBar, buttonAriaLabel: `Plates for set ${index}` }
        }
      />
      <span className="text-muted-foreground text-sm">×</span>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        defaultValue={set.reps || ""}
        placeholder="0"
        disabled={!editable}
        className="h-9 text-center"
        aria-label={`Set ${index} reps`}
        onFocus={selectNumericInput}
        onBlur={(e) => commitReps(e.target.value)}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground size-8 justify-self-center"
        aria-label={`Remove set ${index}`}
        disabled={!editable || !canDelete}
        onClick={onDelete}
      >
        <X className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={completed ? "default" : "outline"}
        aria-pressed={completed}
        aria-label={completed ? "Mark set incomplete" : "Mark set complete"}
        disabled={!editable}
        className={cn(
          "relative size-9 justify-self-center active:scale-90",
          celebrate && "animate-check-thunk",
          completed &&
            "bg-success text-success-foreground hover:bg-success/90 border-transparent",
        )}
        onClick={toggleCompleted}
        onAnimationEnd={(e) => {
          // The halo is the longest part of the celebration; end it there.
          if (e.animationName === "check-ring") setCelebrate(false);
        }}
      >
        {/* Halo that radiates out once on completion. */}
        {celebrate ? (
          <span
            aria-hidden
            className="animate-check-ring ring-success pointer-events-none absolute inset-0 rounded-md ring-2"
          />
        ) : null}
        <Check
          className={cn(
            "size-4 transition-transform",
            celebrate && "animate-pop",
            completed && "scale-110",
          )}
          strokeWidth={completed ? 3 : 2}
        />
      </Button>
    </div>
  );
}
