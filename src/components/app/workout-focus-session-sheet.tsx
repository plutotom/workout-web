"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ArrowDown, ArrowUp, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { ExerciseNoteField } from "@/components/app/exercise-note-field";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useVisualViewportFrame } from "@/hooks/use-visual-viewport-frame";
import { cn } from "@/lib/utils";

type SheetSet = {
  _id: Id<"sets">;
  completed: boolean;
  weight: number;
  reps: number;
};

type SheetExercise = {
  _id: Id<"sessionExercises">;
  slug: string;
  notes?: string;
  sets: SheetSet[];
};

/**
 * Structural-edit hub for the Focus view: jump between sets, reorder
 * exercises, add/remove sets, edit notes, and add/delete exercises. The set
 * card stays calm; everything structural lives here.
 */
export function WorkoutFocusSessionSheet({
  open,
  onOpenChange,
  exercises,
  currentSetId,
  onJump,
  onAddExercise,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: SheetExercise[];
  currentSetId: Id<"sets"> | null;
  onJump: (setId: Id<"sets">) => void;
  onAddExercise: () => void;
}) {
  const catalog = useExerciseCatalog();
  const addSet = useMutation(api.routes.workouts.mutations.addSet);
  const deleteSet = useMutation(api.routes.workouts.mutations.deleteSet);
  const moveExercise = useMutation(api.routes.workouts.mutations.moveExercise);
  const removeExercise = useMutation(
    api.routes.workouts.mutations.removeExercise,
  );

  const [exerciseToRemove, setExerciseToRemove] = useState<{
    id: Id<"sessionExercises">;
    name: string;
  } | null>(null);
  const [removingExercise, setRemovingExercise] = useState(false);
  const { style: viewportStyle, keyboardOpen } = useVisualViewportFrame(open);

  async function handleMove(id: Id<"sessionExercises">, delta: number) {
    try {
      await moveExercise({ sessionExerciseId: id, delta });
    } catch {
      toast.error("Couldn't reorder exercise");
    }
  }

  async function handleRemoveExercise() {
    if (!exerciseToRemove || removingExercise) return;
    setRemovingExercise(true);
    try {
      await removeExercise({ sessionExerciseId: exerciseToRemove.id });
      toast.success(`Removed ${exerciseToRemove.name}`);
      setExerciseToRemove(null);
    } catch {
      toast.error("Couldn't remove exercise");
    } finally {
      setRemovingExercise(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          style={viewportStyle}
          className={cn(
            "flex flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
            !viewportStyle && "h-dvh max-h-dvh",
          )}
        >
          <SheetHeader className="shrink-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-12 pb-2">
            <SheetTitle className="text-lg">Session</SheetTitle>
            <SheetDescription>
              Jump to a set, reorder, or edit this workout.
            </SheetDescription>
          </SheetHeader>

          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3",
              keyboardOpen
                ? "pb-3"
                : "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            )}
          >
            {exercises.map((exercise, exIndex) => {
              const name = catalog.name(exercise.slug);
              return (
                <div
                  key={exercise._id}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-base font-semibold">
                      {name}
                    </p>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground size-10"
                        aria-label={`Move ${name} up`}
                        disabled={exIndex === 0}
                        onClick={() => void handleMove(exercise._id, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground size-10"
                        aria-label={`Move ${name} down`}
                        disabled={exIndex === exercises.length - 1}
                        onClick={() => void handleMove(exercise._id, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive size-10"
                        aria-label={`Remove ${name}`}
                        onClick={() =>
                          setExerciseToRemove({ id: exercise._id, name })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {exercise.sets.map((set, setIndex) => (
                      <button
                        key={set._id}
                        type="button"
                        aria-label={`Go to ${name} set ${setIndex + 1}`}
                        onClick={() => {
                          onJump(set._id);
                          onOpenChange(false);
                        }}
                        className={cn(
                          "flex size-10 items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors",
                          set.completed
                            ? "border-transparent bg-success/15 text-success"
                            : "border-[var(--line)] text-muted-foreground",
                          set._id === currentSetId &&
                            "ring-2 ring-foreground/60",
                        )}
                      >
                        {setIndex + 1}
                      </button>
                    ))}
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-10"
                      aria-label={`Add set to ${name}`}
                      onClick={() =>
                        void addSet({ sessionExerciseId: exercise._id }).catch(
                          () => toast.error("Couldn't add set"),
                        )
                      }
                    >
                      <Plus className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="size-10"
                      aria-label={`Remove last set from ${name}`}
                      disabled={exercise.sets.length <= 1}
                      onClick={() => {
                        const last = exercise.sets[exercise.sets.length - 1];
                        if (last)
                          void deleteSet({ setId: last._id }).catch(() =>
                            toast.error("Couldn't remove set"),
                          );
                      }}
                    >
                      <Minus className="size-4" />
                    </Button>
                  </div>

                  <div className="mt-2">
                    <ExerciseNoteField
                      key={`${exercise.slug}-${exercise.notes ?? ""}`}
                      exerciseSlug={exercise.slug}
                      initialNotes={exercise.notes}
                      compact
                    />
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full text-base"
              onClick={() => {
                onOpenChange(false);
                onAddExercise();
              }}
            >
              <Plus className="size-4" />
              Add exercise
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={exerciseToRemove !== null}
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen && !removingExercise) setExerciseToRemove(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {exerciseToRemove?.name}?</DialogTitle>
            <DialogDescription>
              This removes the exercise and its sets from this workout. You can
              add it again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" disabled={removingExercise}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={removingExercise}
              onClick={() => void handleRemoveExercise()}
            >
              {removingExercise ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
