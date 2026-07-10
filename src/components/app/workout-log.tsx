"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  Check,
  Clock,
  GripVertical,
  MoreHorizontal,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Doc, Id } from "@backend/dataModel";
import { EmptyState } from "@/components/app/empty-state";
import { DeleteWorkoutButton } from "@/components/app/delete-workout-button";
import { ExerciseNoteField } from "@/components/app/exercise-note-field";
import { ExercisePicker } from "@/components/app/exercise-picker";
import { PageHeader } from "@/components/app/page-header";
import { LiftWeightInput } from "@/components/app/lift-weight-input";
import { useWorkoutFinishFlow } from "@/components/app/workout-finish-flow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/haptics";
import {
  formatClock,
  nextSetLabel,
  restRemaining as restRemainingAt,
  useWorkoutRest,
} from "@/lib/workout-rest";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { formatLb } from "@/components/app/workout-design";

type DragState = {
  from: number;
  over: number;
  pointerId: number;
  pointerY: number;
  offsetY: number;
  rowLeft: number;
  rowWidth: number;
};
type SessionExerciseForReorder = {
  _id: Id<"sessionExercises">;
};

const REORDER_ROW_STEP_PX = 85;

export function WorkoutLog({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const catalog = useExerciseCatalog();
  const session = useQuery(api.routes.workouts.queries.get, {
    sessionId: sessionId as Id<"workoutSessions">,
  });
  const user = useQuery(api.routes.auth.users.current);
  // Missing/loading profile keeps the timer on — the original behavior.
  const restTimerEnabled = user?.restTimerEnabled ?? true;
  const addSet = useMutation(api.routes.workouts.mutations.addSet);
  const deleteSet = useMutation(api.routes.workouts.mutations.deleteSet);
  const moveExercise = useMutation(api.routes.workouts.mutations.moveExercise);
  const addExercise = useMutation(api.routes.workouts.mutations.addExercise);
  const removeExercise = useMutation(
    api.routes.workouts.mutations.removeExercise,
  );
  const {
    finishing,
    handleFinish,
    dialogs: finishDialogs,
  } = useWorkoutFinishFlow({ sessionId, session });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [exerciseMenu, setExerciseMenu] = useState<{
    id: Id<"sessionExercises">;
    name: string;
    hasNote: boolean;
  } | null>(null);
  const [exerciseToRemove, setExerciseToRemove] = useState<{
    id: Id<"sessionExercises">;
    name: string;
  } | null>(null);
  const [removingExercise, setRemovingExercise] = useState(false);
  const [noteOpenSignals, setNoteOpenSignals] = useState<
    Partial<Record<Id<"sessionExercises">, number>>
  >({});
  const [now, setNow] = useState(() => Date.now());
  const { rest, startRest, clearRest, addSeconds } = useWorkoutRest();
  const [drag, setDrag] = useState<DragState | null>(null);

  const exerciseCount = session?.exercises.length ?? 0;
  const dragOverFromPoint = useCallback(
    (x: number, y: number) => {
      const target = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-session-ex-index]");
      const over = target ? Number(target.dataset.sessionExIndex) : null;

      setDrag((current) => {
        if (!current) return current;
        return {
          ...current,
          pointerY: y,
          over:
            over !== null &&
            Number.isInteger(over) &&
            over >= 0 &&
            over < exerciseCount
              ? over
              : current.over,
        };
      });
    },
    [exerciseCount],
  );

  const reorderExercise = useCallback(
    async (
      exercises: SessionExerciseForReorder[],
      from: number,
      to: number,
    ) => {
      setDrag(null);
      if (from === to || to < 0 || to >= exercises.length) return;

      const movedExercise = exercises[from];
      if (!movedExercise) return;

      try {
        if (from < to) {
          for (let index = from; index < to; index += 1) {
            await moveExercise({
              sessionExerciseId: movedExercise._id,
              delta: 1,
            });
          }
        } else {
          for (let index = from; index > to; index -= 1) {
            await moveExercise({
              sessionExerciseId: movedExercise._id,
              delta: -1,
            });
          }
        }
      } catch {
        toast.error("Couldn't reorder exercise");
      }
    },
    [moveExercise],
  );

  useEffect(() => {
    if (session?.status !== "in_progress") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session?.status]);

  useEffect(() => {
    if (!drag || !session) return;
    const activeSession = session;

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== drag?.pointerId) return;
      event.preventDefault();
      dragOverFromPoint(event.clientX, event.clientY);
    }

    function handlePointerEnd(event: PointerEvent) {
      if (event.pointerId !== drag?.pointerId) return;
      event.preventDefault();
      void reorderExercise(activeSession.exercises, drag.from, drag.over);
    }

    function handlePointerCancel(event: PointerEvent) {
      if (event.pointerId !== drag?.pointerId) return;
      event.preventDefault();
      setDrag(null);
    }

    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerEnd, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel, {
      passive: false,
    });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [drag, dragOverFromPoint, reorderExercise, session]);

  if (session === undefined) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Log Workout" backHref="/dashboard" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Log Workout" backHref="/dashboard" />
        <EmptyState
          title="Workout not found"
          description="It may have been abandoned or removed."
        />
      </div>
    );
  }

  const editable = session.status === "in_progress";
  const historyHref = session.templateId
    ? `/templates/${session.templateId}/history`
    : "/dashboard";
  const usedSlugs = session.exercises.map((e) => e.slug);

  async function handleAddExercises(slugs: string[]) {
    try {
      for (const slug of slugs) {
        await addExercise({
          sessionId: sessionId as Id<"workoutSessions">,
          exerciseSlug: slug,
        });
      }
      setPickerOpen(false);
    } catch {
      toast.error("Couldn't add exercise");
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

  const totalSets = session.exercises.reduce(
    (sum, ex) => sum + ex.sets.length,
    0,
  );
  const doneSets = session.exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0,
  );
  const volume = session.exercises.reduce(
    (sum, ex) =>
      sum +
      ex.sets.reduce(
        (setSum, set) =>
          set.completed ? setSum + set.weight * set.reps : setSum,
        0,
      ),
    0,
  );
  const nextSetId = (() => {
    for (const exercise of session.exercises) {
      const set = exercise.sets.find((s) => !s.completed);
      if (set) return set._id;
    }
    return null;
  })();
  const elapsedEnd =
    session.status === "in_progress"
      ? now
      : (session.completedAt ?? session.startedAt);
  const elapsedSeconds = Math.max(
    0,
    Math.floor((elapsedEnd - session.startedAt) / 1000),
  );
  const restRemaining = restRemainingAt(rest, now);
  const isReordering = drag !== null;
  const draggedExercise = drag ? session.exercises[drag.from] : null;

  return (
    <div className="relative flex flex-col gap-5 pb-24">
      <PageHeader
        title={session.templateName}
        backHref={editable ? "/dashboard" : historyHref}
        action={
          editable ? (
            <Button size="sm" onClick={handleFinish} disabled={finishing}>
              {finishing ? "Finishing…" : "Finish"}
            </Button>
          ) : undefined
        }
      />

      {!editable ? (
        <p className="text-muted-foreground text-sm">
          This workout is{" "}
          {session.status === "completed" ? "complete" : "no longer active"}.
        </p>
      ) : null}

      <div className="sticky top-16 z-20 -mx-4 border-y bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {editable ? "Active session" : "Session"}
            </p>
            <p className="text-sm font-medium">{session.templateName}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatClock(elapsedSeconds)}
            </p>
            <p className="text-xs text-muted-foreground">
              {doneSets}/{totalSets} sets · {formatLb(volume)} moved
            </p>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-all duration-300"
            style={{
              width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {editable && session.exercises.length === 0 ? (
        <EmptyState
          title="Add your first exercise"
          description="Build this workout as you go — pick a lift and start logging sets."
          action={
            <Button
              type="button"
              onClick={() => {
                setPickerKey((k) => k + 1);
                setPickerOpen(true);
              }}
            >
              <Plus className="size-4" />
              Add exercise
            </Button>
          }
        />
      ) : null}

      {session.exercises.map((exercise, exIndex) => {
        const reorderOffset = getReorderOffset(exIndex, drag);
        if (drag && exIndex === drag.from) {
          return (
            <div
              key={`${exercise._id}-placeholder`}
              data-session-ex-index={exIndex}
              className="pointer-events-none h-[65px] rounded-lg border border-dashed border-foreground/50 bg-foreground/5 transition-transform duration-200 ease-out"
              style={{
                transform: reorderOffset
                  ? `translateY(${reorderOffset}px)`
                  : undefined,
              }}
              aria-hidden
            />
          );
        }

        const maxWeight = Math.max(...exercise.sets.map((s) => s.weight), 0);
        const repSummary = summarizeReps(exercise.sets.map((s) => s.reps));
        const exerciseName = catalog.name(exercise.slug);
        return (
          <Card
            key={exercise._id}
            data-session-ex-index={exIndex}
            className={cn(
              "overflow-hidden border-[var(--line)] bg-[var(--surface)] transition-all duration-200",
              isReordering && "gap-0 rounded-lg py-0 shadow-none",
              drag?.over === exIndex && "border-foreground/50 bg-foreground/5",
            )}
            style={{
              transform: reorderOffset
                ? `translateY(${reorderOffset}px)`
                : undefined,
            }}
          >
            <CardHeader
              className={cn(
                "flex flex-row items-start justify-between gap-3 space-y-0",
                isReordering ? "px-4 py-3" : "pb-2",
              )}
            >
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-base">
                  {exerciseName}
                </CardTitle>
                {!isReordering ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {exercise.sets.length} × {repSummary} · up to {maxWeight} lb
                  </p>
                ) : null}
              </div>
              {editable ? (
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground -mr-1 h-11 w-11 sm:size-9"
                    aria-label={`${exerciseName} options`}
                    onClick={() =>
                      setExerciseMenu({
                        id: exercise._id,
                        name: exerciseName,
                        hasNote: Boolean(exercise.notes?.trim()),
                      })
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "text-muted-foreground hover:text-foreground -mr-2 h-11 w-11 cursor-grab touch-none active:cursor-grabbing sm:-mr-1 sm:size-9",
                      isReordering && "bg-foreground/5",
                    )}
                    aria-label={`Reorder ${exerciseName}`}
                    aria-pressed={drag?.from === exIndex}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      const row = event.currentTarget.closest<HTMLElement>(
                        "[data-session-ex-index]",
                      );
                      const rect = row?.getBoundingClientRect();
                      hapticTap();
                      setDrag({
                        from: exIndex,
                        over: exIndex,
                        pointerId: event.pointerId,
                        pointerY: event.clientY,
                        offsetY: rect ? event.clientY - rect.top : 32,
                        rowLeft: rect?.left ?? 0,
                        rowWidth: rect?.width ?? 0,
                      });
                    }}
                  >
                    <GripVertical className="size-4" />
                  </Button>
                </div>
              ) : null}
            </CardHeader>
            {!isReordering ? (
              <CardContent className="flex flex-col gap-3">
                <ExerciseNoteField
                  key={`${exercise.slug}-${exercise.notes ?? ""}`}
                  exerciseSlug={exercise.slug}
                  initialNotes={exercise.notes}
                  editable={editable}
                  compact
                  hideEmptyPrompt
                  openSignal={noteOpenSignals[exercise._id] ?? 0}
                />
                <div className="text-muted-foreground grid grid-cols-[2rem_1fr_auto_1fr_2.5rem_2.5rem] gap-2 px-1 text-xs font-medium tracking-wide uppercase">
                  <span>Set</span>
                  <span>Weight</span>
                  <span />
                  <span>Reps</span>
                  <span />
                  <span className="text-center">✓</span>
                </div>
                {exercise.sets.map((set, i) => (
                  <SetRow
                    key={set._id}
                    set={set}
                    index={i + 1}
                    editable={editable}
                    canDelete={exercise.sets.length > 1}
                    includeBar={catalog.usesBar(exercise.slug)}
                    onDelete={() => void deleteSet({ setId: set._id })}
                    highlighted={set._id === nextSetId}
                    onLogged={() => {
                      if (!restTimerEnabled) return;
                      startRest(
                        exercise.restSeconds ?? 75,
                        nextSetLabel(session.exercises, exercise._id, i),
                      );
                    }}
                  />
                ))}
                {editable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 self-start"
                    onClick={() =>
                      void addSet({ sessionExerciseId: exercise._id })
                    }
                  >
                    <Plus className="size-4" />
                    Add set
                  </Button>
                ) : null}
              </CardContent>
            ) : null}
          </Card>
        );
      })}

      {drag && draggedExercise ? (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-foreground/60 bg-[var(--surface)] shadow-2xl shadow-black/40 ring-1 ring-white/10"
          style={{
            left: drag.rowLeft,
            top: drag.pointerY - drag.offsetY,
            width: drag.rowWidth,
          }}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">
                {catalog.name(draggedExercise.slug)}
              </p>
            </div>
            <div className="bg-foreground/10 text-muted-foreground flex size-9 items-center justify-center rounded-md">
              <GripVertical className="size-4" />
            </div>
          </div>
        </div>
      ) : null}

      {editable && session.exercises.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={usedSlugs.length >= catalog.all.length}
          onClick={() => {
            setPickerKey((k) => k + 1);
            setPickerOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add exercise
        </Button>
      ) : session.status === "completed" ? (
        <DeleteWorkoutButton
          sessionId={sessionId as Id<"workoutSessions">}
          onDeleted={() => router.push(historyHref)}
        />
      ) : null}

      <ExercisePicker
        key={pickerKey}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        usedSlugs={usedSlugs}
        onAdd={handleAddExercises}
      />

      <Sheet
        open={exerciseMenu !== null}
        onOpenChange={(open) => {
          if (!open) setExerciseMenu(null);
        }}
      >
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-8">
          <SheetHeader className="pb-2">
            <SheetTitle className="truncate">
              {exerciseMenu?.name ?? "Exercise"}
            </SheetTitle>
            <SheetDescription>Exercise options</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground h-12 justify-start gap-3 px-3 text-base"
              onClick={() => {
                if (!exerciseMenu) return;
                const id = exerciseMenu.id;
                setNoteOpenSignals((prev) => ({
                  ...prev,
                  [id]: (prev[id] ?? 0) + 1,
                }));
                setExerciseMenu(null);
              }}
            >
              <StickyNote className="size-4" />
              {exerciseMenu?.hasNote ? "Edit note" : "Add note"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive h-12 justify-start gap-3 px-3 text-base"
              onClick={() => {
                if (!exerciseMenu) return;
                setExerciseToRemove({
                  id: exerciseMenu.id,
                  name: exerciseMenu.name,
                });
                setExerciseMenu(null);
              }}
            >
              <Trash2 className="size-4" />
              Remove exercise
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={exerciseToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removingExercise) setExerciseToRemove(null);
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

      {finishDialogs}

      {rest && restTimerEnabled ? (
        <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-[600px] px-4">
          <div className="animate-slide-up-bar rounded-t-xl border bg-background/95 p-3 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  <Clock className="size-3.5" />
                  Rest {formatClock(restRemaining)}
                </p>
                <p className="truncate text-sm font-medium">
                  Next · {rest.label}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addSeconds(15)}
                >
                  +15s
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearRest}
                >
                  Skip
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function summarizeReps(reps: number[]): string {
  const valid = reps.filter((r) => r > 0);
  if (valid.length === 0) return "reps";
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return min === max ? String(min) : `${min}-${max}`;
}

function getReorderOffset(index: number, drag: DragState | null): number {
  if (!drag) return 0;
  if (index === drag.from) {
    return (drag.over - drag.from) * REORDER_ROW_STEP_PX;
  }
  if (drag.from < drag.over && index > drag.from && index <= drag.over) {
    return -REORDER_ROW_STEP_PX;
  }
  if (drag.from > drag.over && index >= drag.over && index < drag.from) {
    return REORDER_ROW_STEP_PX;
  }
  return 0;
}

function selectNumericInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

function SetRow({
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
