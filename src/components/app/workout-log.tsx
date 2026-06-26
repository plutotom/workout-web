"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Doc, Id } from "@backend/dataModel";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PlateCalcButton } from "@/components/app/plate-calculator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { exerciseName, exerciseUsesBar } from "@/lib/exercises";

type TemplateData =
  | {
      exercises: { slug: string; sets: { weight: number; reps: number }[] }[];
    }
  | null
  | undefined;

/**
 * True when the sets logged this session differ from the template's presets,
 * for any exercise still on the template. Uses all logged rows (the checkmark
 * is a progress aid, not a gate), matching how the sync writes them back.
 */
function templateDiffersFromSession(
  exercises: { slug: string; sets: Doc<"sets">[] }[],
  template: TemplateData,
): boolean {
  if (!template) return false;
  const bySlug = new Map(template.exercises.map((e) => [e.slug, e.sets]));
  for (const ex of exercises) {
    const current = bySlug.get(ex.slug);
    if (!current) continue;
    if (
      ex.sets.length !== current.length ||
      ex.sets.some(
        (s, i) => s.weight !== current[i].weight || s.reps !== current[i].reps,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function WorkoutLog({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const session = useQuery(api.routes.workouts.queries.get, {
    sessionId: sessionId as Id<"workoutSessions">,
  });
  const template = useQuery(
    api.routes.templates.queries.get,
    session ? { templateId: session.templateId } : "skip",
  );
  const addSet = useMutation(api.routes.workouts.mutations.addSet);
  const finish = useMutation(api.routes.workouts.mutations.finish);
  const abandon = useMutation(api.routes.workouts.mutations.abandon);
  const syncFromSession = useMutation(
    api.routes.templates.mutations.syncFromSession,
  );
  const [finishing, setFinishing] = useState(false);
  const [incompleteOpen, setIncompleteOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

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
  const historyHref = `/templates/${session.templateId}/history`;
  const templateDiffers = templateDiffersFromSession(
    session.exercises,
    template,
  );
  const hasUncheckedSets = session.exercises.some((ex) =>
    ex.sets.some((s) => !s.completed),
  );

  // The Finish button: if some sets are unchecked, ask save-or-discard first;
  // otherwise complete the workout directly.
  function handleFinish() {
    if (hasUncheckedSets) {
      setIncompleteOpen(true);
      return;
    }
    void finishWorkout();
  }

  async function finishWorkout() {
    setIncompleteOpen(false);
    setFinishing(true);
    try {
      await finish({ sessionId: sessionId as Id<"workoutSessions"> });
      // Offer to push today's numbers back to the template, but only if they
      // actually differ.
      if (templateDiffers) {
        setFinishing(false);
        setSyncOpen(true);
        return;
      }
      toast.success("Workout finished");
      router.push("/dashboard");
    } catch {
      setFinishing(false);
      toast.error("Couldn't finish workout");
    }
  }

  async function discardWorkout() {
    setIncompleteOpen(false);
    setFinishing(true);
    try {
      await abandon({ sessionId: sessionId as Id<"workoutSessions"> });
      toast.success("Workout discarded");
      router.push("/dashboard");
    } catch {
      setFinishing(false);
      toast.error("Couldn't discard workout");
    }
  }

  async function handleSync(update: boolean) {
    setSyncOpen(false);
    if (update) {
      try {
        await syncFromSession({
          sessionId: sessionId as Id<"workoutSessions">,
        });
        toast.success("Template updated");
      } catch {
        toast.error("Couldn't update template");
      }
    } else {
      toast.success("Workout finished");
    }
    router.push("/dashboard");
  }

  return (
    <div className="flex flex-col gap-5">
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

      {session.exercises.map((exercise) => (
        <Card key={exercise._id}>
          <CardHeader>
            <CardTitle className="text-base">
              {exerciseName(exercise.slug)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="text-muted-foreground grid grid-cols-[2rem_1fr_1fr_2.5rem] gap-2 px-1 text-xs font-medium tracking-wide uppercase">
              <span>Set</span>
              <span>Weight</span>
              <span>Reps</span>
              <span className="text-center">✓</span>
            </div>
            {exercise.sets.map((set, i) => (
              <SetRow
                key={set._id}
                set={set}
                index={i + 1}
                editable={editable}
                includeBar={exerciseUsesBar(exercise.slug)}
              />
            ))}
            {editable ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 self-start"
                onClick={() => void addSet({ sessionExerciseId: exercise._id })}
              >
                <Plus className="size-4" />
                Add set
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <Dialog open={incompleteOpen} onOpenChange={setIncompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish this workout?</DialogTitle>
            <DialogDescription>
              Some sets aren&apos;t checked off. Save this workout anyway, or
              discard it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button onClick={() => void finishWorkout()}>Save workout</Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => void discardWorkout()}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update template?</DialogTitle>
            <DialogDescription>
              Update {session.templateName} to match the weights and reps you
              just logged?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-col sm:gap-2">
            <Button onClick={() => handleSync(true)}>Update template</Button>
            <Button variant="outline" onClick={() => handleSync(false)}>
              Keep as is
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SetRow({
  set,
  index,
  editable,
  includeBar,
}: {
  set: Doc<"sets">;
  index: number;
  editable: boolean;
  includeBar: boolean;
}) {
  const updateSet = useMutation(api.routes.workouts.mutations.updateSet);
  // Weight is controlled so an applied plate-calc value reflects immediately.
  const [weightStr, setWeightStr] = useState(
    set.weight ? String(set.weight) : "",
  );
  // Optimistic checkmark so the toggle flips instantly on tap (both ways),
  // independent of the mutation round-trip.
  const [pendingCompleted, setPendingCompleted] = useState<boolean | null>(
    null,
  );
  const completed = pendingCompleted ?? set.completed;

  function toggleCompleted() {
    const next = !completed;
    setPendingCompleted(next);
    void updateSet({ setId: set._id, completed: next }).catch(() =>
      setPendingCompleted(null),
    );
  }

  function commitWeight(raw: string) {
    const value = raw.trim() === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(value) || value === set.weight) return;
    void updateSet({ setId: set._id, weight: value });
  }

  function commitReps(raw: string) {
    const value = raw.trim() === "" ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (Number.isNaN(value) || value === set.reps) return;
    void updateSet({ setId: set._id, reps: value });
  }

  function applyWeight(weight: number) {
    setWeightStr(String(weight));
    if (weight !== set.weight) void updateSet({ setId: set._id, weight });
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[2rem_1fr_1fr_2.5rem] items-center gap-2 rounded-md px-1 py-1.5",
        completed && "border-success/40 bg-success/10 border",
      )}
    >
      <span className="text-muted-foreground text-sm tabular-nums">
        {index}
      </span>
      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={weightStr}
          placeholder="0"
          disabled={!editable}
          className="h-9 pr-8 text-center"
          aria-label={`Set ${index} weight`}
          onChange={(e) => setWeightStr(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={(e) => commitWeight(e.target.value)}
        />
        <PlateCalcButton
          weight={Number(weightStr) || 0}
          includeBar={includeBar}
          onApply={editable ? applyWeight : undefined}
          aria-label={`Plates for set ${index}`}
          className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2"
        />
      </div>
      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        defaultValue={set.reps || ""}
        placeholder="0"
        disabled={!editable}
        className="h-9 text-center"
        aria-label={`Set ${index} reps`}
        onBlur={(e) => commitReps(e.target.value)}
      />
      <Button
        type="button"
        size="icon"
        variant={completed ? "default" : "outline"}
        aria-pressed={completed}
        aria-label={completed ? "Mark set incomplete" : "Mark set complete"}
        disabled={!editable}
        className={cn(
          "size-9 justify-self-center",
          completed &&
            "bg-success text-success-foreground hover:bg-success/90 border-transparent",
        )}
        onClick={toggleCompleted}
      >
        <Check className="size-4" />
      </Button>
    </div>
  );
}
