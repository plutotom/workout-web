"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  Minus,
  Plus,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { AiSessionButton } from "@/components/app/ai-session-button";
import { EmptyState } from "@/components/app/empty-state";
import { ExerciseNoteField } from "@/components/app/exercise-note-field";
import { ExercisePicker } from "@/components/app/exercise-picker";
import { PageHeader } from "@/components/app/page-header";
import { LiftWeightInput } from "@/components/app/lift-weight-input";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { useWorkoutFinishFlow } from "@/components/app/workout-finish-flow";
import { RestRing } from "@/components/app/workout-focus-rest-ring";
import { WorkoutFocusSessionSheet } from "@/components/app/workout-focus-session-sheet";
import { WorkoutLog } from "@/components/app/workout-log";
import { formatLb, formatDuration } from "@/components/app/workout-design";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/haptics";
import {
  formatClock,
  nextSetLabel,
  restRemaining as restRemainingAt,
  useWorkoutRest,
} from "@/lib/workout-rest";

const SWIPE_THRESHOLD_PX = 56;

/**
 * Focus mode: one set at a time on the same session data as the List view.
 * Logging a set raises the full-screen rest ring; when it drains (or is
 * skipped) the cursor advances to the next incomplete set. Structural edits
 * live in the Session sheet.
 */
export function WorkoutFocus({ sessionId }: { sessionId: string }) {
  const catalog = useExerciseCatalog();
  const session = useQuery(api.routes.workouts.queries.get, {
    sessionId: sessionId as Id<"workoutSessions">,
  });
  const updateSet = useMutation(api.routes.workouts.mutations.updateSet);
  const addExercise = useMutation(api.routes.workouts.mutations.addExercise);
  const {
    finishing,
    awaitingPostFinish,
    handleFinish,
    dialogs: finishDialogs,
  } = useWorkoutFinishFlow({ sessionId, session });

  // null = follow the first incomplete set; an id = the user jumped/swiped.
  const [manualSetId, setManualSetId] = useState<Id<"sets"> | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // When the ring drains naturally, snap back to the next incomplete set.
  const { rest, startRest, clearRest, addSeconds } = useWorkoutRest(() =>
    setManualSetId(null),
  );
  const swipeStart = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);

  useEffect(() => {
    if (session?.status !== "in_progress") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session?.status]);

  // Flattened cursor space: every set of every exercise, in session order.
  const exercises = session?.exercises ?? [];
  const refs = exercises.flatMap((exercise, exIndex) =>
    exercise.sets.map((set, setIndex) => ({
      exercise,
      set,
      exIndex,
      setIndex,
    })),
  );
  const autoIndex = refs.findIndex((r) => !r.set.completed);
  const manualIndex = manualSetId
    ? refs.findIndex((r) => r.set._id === manualSetId)
    : -1;
  const cursorIndex = manualIndex >= 0 ? manualIndex : autoIndex;
  const current = cursorIndex >= 0 ? refs[cursorIndex] : null;

  const editable = session?.status === "in_progress";
  const lastTime = useQuery(
    api.routes.workouts.queries.lastLoggedSet,
    editable && current ? { exerciseSlug: current.exercise.slug } : "skip",
  );
  const user = useQuery(api.routes.auth.users.current);
  // Missing/loading profile keeps the timer on — the original behavior.
  const restTimerEnabled = user?.restTimerEnabled ?? true;

  if (session === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Log Workout" backHref="/dashboard" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Log Workout" backHref="/dashboard" />
        <EmptyState
          title="Workout not found"
          description="It may have been abandoned or removed."
        />
      </div>
    );
  }

  // Finished/abandoned sessions get the read-only List view (summary rows,
  // delete). Focus is only an in-progress experience — but stay mounted while
  // finish is in flight or a post-finish dialog (update template / save quick
  // start as template) is open, otherwise swapping to WorkoutLog unmounts this
  // hook and drops the prompt. Render a thin shell so edits can't race the dialog.
  if (session.status !== "in_progress") {
    if (finishing || awaitingPostFinish) {
      return (
        <div className="flex flex-col gap-4">
          <PageHeader title={session.templateName} backHref="/dashboard" />
          <p className="text-muted-foreground text-sm">Wrapping up…</p>
          {finishDialogs}
        </div>
      );
    }
    return <WorkoutLog sessionId={sessionId} />;
  }

  const totalSets = refs.length;
  const doneSets = refs.filter((r) => r.set.completed).length;
  const volume = refs.reduce(
    (sum, r) => (r.set.completed ? sum + r.set.weight * r.set.reps : sum),
    0,
  );
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - session.startedAt) / 1000),
  );
  const allDone = refs.length > 0 && cursorIndex < 0;
  const usedSlugs = exercises.map((e) => e.slug);
  const restRemaining = restRemainingAt(rest, now);

  function navigate(delta: number) {
    const base = cursorIndex >= 0 ? cursorIndex : refs.length - 1;
    const target = Math.min(refs.length - 1, Math.max(0, base + delta));
    const ref = refs[target];
    if (ref) setManualSetId(ref.set._id);
  }

  function logCurrentSet() {
    if (!current) return;
    hapticTap();
    if (restTimerEnabled) {
      startRest(
        current.exercise.restSeconds ?? 75,
        nextSetLabel(exercises, current.exercise._id, current.setIndex),
      );
    } else {
      // No ring to dismiss — advance to the next incomplete set right away.
      setManualSetId(null);
    }
    void updateSet({ setId: current.set._id, completed: true }).catch(() => {
      clearRest();
      toast.error("Couldn't log set");
    });
  }

  function undoCurrentSet() {
    if (!current) return;
    setManualSetId(current.set._id);
    void updateSet({ setId: current.set._id, completed: false }).catch(() =>
      toast.error("Couldn't update set"),
    );
  }

  function adjustWeight(delta: number) {
    if (!current) return;
    void updateSet({
      setId: current.set._id,
      weight: Math.max(0, current.set.weight + delta),
    });
  }

  function adjustReps(delta: number) {
    if (!current) return;
    void updateSet({
      setId: current.set._id,
      reps: Math.max(0, current.set.reps + delta),
    });
  }

  function commitReps(raw: string) {
    if (!current) return;
    const value = raw.trim() === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(value) || value === current.set.reps) return;
    void updateSet({ setId: current.set._id, reps: value });
  }

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

  const deltaLb =
    lastTime && current ? current.set.weight - lastTime.weight : 0;

  return (
    <div className="relative flex flex-col gap-4">
      <PageHeader
        title={session.templateName}
        backHref="/dashboard"
        action={
          <Button
            size="sm"
            onClick={handleFinish}
            disabled={finishing || awaitingPostFinish}
          >
            {finishing ? "Finishing…" : "Finish"}
          </Button>
        }
      />

      <div className="sticky top-0 z-20 -mx-3 border-b bg-background px-3 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5">
        <div className="mb-2 flex items-end justify-between gap-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Focus session
          </p>
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

      {exercises.length === 0 ? (
        <EmptyState
          title="Add your first exercise"
          description="Build this workout as you go — describe it with AI, or pick lifts yourself."
          action={
            <div className="flex w-full max-w-xs flex-col gap-2">
              <AiSessionButton
                sessionId={sessionId as Id<"workoutSessions">}
                current={[]}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPickerKey((k) => k + 1);
                  setPickerOpen(true);
                }}
              >
                <Plus className="size-4" />
                Add exercise
              </Button>
            </div>
          }
        />
      ) : allDone ? (
        <Card className="border-[var(--line)] bg-[var(--surface)]">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="bg-success/15 text-success flex size-14 items-center justify-center rounded-full">
              <Check className="size-7" strokeWidth={3} />
            </div>
            <div>
              <p className="text-lg font-semibold">All sets logged</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {doneSets} sets · {formatLb(volume)} moved ·{" "}
                {formatDuration(elapsedSeconds * 1000)}
              </p>
            </div>
            <Button
              size="lg"
              className="w-full max-w-60"
              onClick={handleFinish}
              disabled={finishing || awaitingPostFinish}
            >
              {finishing ? "Finishing…" : "Finish workout"}
            </Button>
            <div className="flex w-full max-w-60 flex-col gap-2">
              <AiSessionButton
                sessionId={sessionId as Id<"workoutSessions">}
                current={exercises.map((ex) => ({
                  slug: ex.slug,
                  sets: ex.sets.map((s) => ({
                    completed: s.completed,
                    weight: s.weight,
                    reps: s.reps,
                  })),
                }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setSheetOpen(true)}
              >
                <ListOrdered className="size-4" />
                Review sets
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : current ? (
        <Card
          className="touch-pan-y border-[var(--line)] bg-[var(--surface)]"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("input,button,textarea,a"))
              return;
            swipeStart.current = {
              x: e.clientX,
              y: e.clientY,
              pointerId: e.pointerId,
            };
          }}
          onPointerUp={(e) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start || start.pointerId !== e.pointerId) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (
              Math.abs(dx) > SWIPE_THRESHOLD_PX &&
              Math.abs(dx) > 2 * Math.abs(dy)
            ) {
              navigate(dx < 0 ? 1 : -1);
            }
          }}
        >
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground size-9"
                aria-label="Previous set"
                disabled={cursorIndex <= 0}
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <div className="min-w-0 text-center">
                <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Exercise {current.exIndex + 1} of {exercises.length}
                </p>
                <p className="truncate text-lg font-semibold">
                  {catalog.name(current.exercise.slug)}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground size-9"
                aria-label="Next set"
                disabled={cursorIndex >= refs.length - 1}
                onClick={() => navigate(1)}
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>

            <div
              className="flex items-center justify-center gap-2"
              aria-label={`Set ${current.setIndex + 1} of ${current.exercise.sets.length}`}
            >
              {current.exercise.sets.map((set, i) => (
                <span
                  key={set._id}
                  aria-hidden
                  className={cn(
                    "size-2.5 rounded-full transition-colors",
                    set.completed
                      ? "bg-success"
                      : i === current.setIndex
                        ? "bg-foreground ring-2 ring-foreground/30 ring-offset-2 ring-offset-[var(--surface)]"
                        : "bg-muted",
                  )}
                />
              ))}
            </div>

            <p className="text-center text-sm font-medium">
              Set {current.setIndex + 1} of {current.exercise.sets.length}
              {current.set.completed ? (
                <span className="text-success"> · logged</span>
              ) : null}
            </p>

            <ExerciseNoteField
              key={`${current.exercise.slug}-${current.exercise.notes ?? ""}`}
              exerciseSlug={current.exercise.slug}
              initialNotes={current.exercise.notes}
              compact
            />

            <div className="grid gap-3">
              <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  aria-label="Decrease weight by 5 lb"
                  onClick={() => adjustWeight(-5)}
                >
                  <Minus className="size-4" />
                </Button>
                <LiftWeightInput
                  value={current.set.weight}
                  inputClassName="h-12 text-center text-lg font-semibold"
                  aria-label="Weight"
                  onCommit={(weight) => {
                    if (weight !== current.set.weight) {
                      void updateSet({ setId: current.set._id, weight });
                    }
                  }}
                  plateCalc={{
                    includeBar: catalog.usesBar(current.exercise.slug),
                    onApply: (weight) => {
                      if (weight !== current.set.weight) {
                        void updateSet({ setId: current.set._id, weight });
                      }
                    },
                    buttonAriaLabel: "Plate calculator",
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  aria-label="Increase weight by 5 lb"
                  onClick={() => adjustWeight(5)}
                >
                  <Plus className="size-4" />
                </Button>
                <p className="text-muted-foreground text-center text-xs">−5</p>
                <p className="text-muted-foreground text-center text-xs">
                  Weight (lb)
                </p>
                <p className="text-muted-foreground text-center text-xs">+5</p>
              </div>

              <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  aria-label="Decrease reps"
                  onClick={() => adjustReps(-1)}
                >
                  <Minus className="size-4" />
                </Button>
                <Input
                  key={`${current.set._id}-${current.set.reps}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  defaultValue={current.set.reps || ""}
                  placeholder="0"
                  className="h-12 text-center text-lg font-semibold"
                  aria-label="Reps"
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => commitReps(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  aria-label="Increase reps"
                  onClick={() => adjustReps(1)}
                >
                  <Plus className="size-4" />
                </Button>
                <span />
                <p className="text-muted-foreground text-center text-xs">
                  Reps
                </p>
                <span />
              </div>
            </div>

            {lastTime ? (
              <p className="text-muted-foreground text-center text-sm">
                Last time {lastTime.weight} × {lastTime.reps}
                {deltaLb !== 0 ? (
                  <span
                    className={cn(
                      "font-medium",
                      deltaLb > 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {" "}
                    · {deltaLb > 0 ? "+" : ""}
                    {deltaLb} lb
                  </span>
                ) : null}
              </p>
            ) : null}

            {current.set.completed ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-14 text-base"
                onClick={undoCurrentSet}
              >
                <Undo2 className="size-5" />
                Mark incomplete
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="h-14 text-base"
                onClick={logCurrentSet}
              >
                <Check className="size-5" strokeWidth={3} />
                Log set
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground self-center"
              onClick={() => setSheetOpen(true)}
            >
              <ListOrdered className="size-4" />
              Session
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <ExercisePicker
        key={pickerKey}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        usedSlugs={usedSlugs}
        onAdd={handleAddExercises}
      />

      <WorkoutFocusSessionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        sessionId={sessionId as Id<"workoutSessions">}
        exercises={exercises}
        currentSetId={current?.set._id ?? null}
        onJump={(setId) => setManualSetId(setId)}
        onAddExercise={() => {
          setPickerKey((k) => k + 1);
          setPickerOpen(true);
        }}
      />

      {finishDialogs}

      {rest && restTimerEnabled ? (
        <RestRing
          rest={rest}
          remaining={restRemaining}
          onAddSeconds={addSeconds}
          onSkip={() => {
            clearRest();
            setManualSetId(null);
          }}
        />
      ) : null}
    </div>
  );
}
