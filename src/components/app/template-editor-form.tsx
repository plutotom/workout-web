"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { PageHeader } from "@/components/app/page-header";
import { ExerciseNoteField } from "@/components/app/exercise-note-field";
import { ExercisePicker } from "@/components/app/exercise-picker";
import { LiftWeightInput } from "@/components/app/lift-weight-input";
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
import { Label } from "@/components/ui/label";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { cn } from "@/lib/utils";
import {
  buildMuscleSegments,
  estimateWorkoutMinutes,
  MuscleBand,
} from "@/components/app/workout-design";

const DEFAULT_SET_ROWS = 3;
const emptySet = () => ({ weight: 0, reps: 0 });

type TemplateSet = { weight: number; reps: number };
type EditorExercise = { slug: string; sets: TemplateSet[]; notes?: string };
type DragState = { from: number; over: number };

function toWhole(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits === "" ? 0 : parseInt(digits, 10);
}

function selectNumericInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.select();
}

export function TemplateEditorForm({
  templateId,
  initial,
}: {
  templateId?: Id<"workoutTemplates">;
  initial: { name: string; exercises: EditorExercise[] };
}) {
  const router = useRouter();
  const catalog = useExerciseCatalog();
  const create = useMutation(api.routes.templates.mutations.create);
  const update = useMutation(api.routes.templates.mutations.update);
  const remove = useMutation(api.routes.templates.mutations.remove);

  const [name, setName] = useState(initial.name);
  const [exercises, setExercises] = useState<EditorExercise[]>(
    initial.exercises,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKey, setPickerKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [openIndex, setOpenIndex] = useState(initial.exercises.length ? 0 : -1);
  const [drag, setDrag] = useState<DragState | null>(null);

  const slugs = exercises.map((e) => e.slug);
  const fetchedNotes = useQuery(api.routes.exercises.queries.getNotes, {
    slugs,
  });
  const notesBySlug = fetchedNotes ?? {};

  const usedSlugs = new Set(exercises.map((e) => e.slug));
  const canSave = name.trim().length > 0 && exercises.length > 0 && !saving;
  const setCount = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const muscleSegments = buildMuscleSegments(
    exercises.map((ex) => ({
      slug: ex.slug,
      sets: ex.sets.length,
      category: catalog.category,
    })),
  );

  function updateExercise(
    index: number,
    fn: (ex: EditorExercise) => EditorExercise,
  ) {
    setExercises((prev) => prev.map((e, i) => (i === index ? fn(e) : e)));
  }

  function reorder(from: number, to: number) {
    if (from === to || to < 0 || to >= exercises.length) {
      setDrag(null);
      return;
    }
    setExercises((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (!moved) return prev;
      next.splice(to, 0, moved);
      return next;
    });
    setOpenIndex((current) => {
      if (current === from) return to;
      if (from < current && current <= to) return current - 1;
      if (to <= current && current < from) return current + 1;
      return current;
    });
    setDrag(null);
  }

  function dragOverFromPoint(x: number, y: number) {
    const target = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-ex-index]");
    if (!target) return;
    const over = Number(target.dataset.exIndex);
    if (Number.isInteger(over)) {
      setDrag((current) => (current ? { ...current, over } : current));
    }
  }

  function removeExercise(index: number) {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  }

  function addExercises(slugs: string[]) {
    setExercises((prev) => {
      const have = new Set(prev.map((e) => e.slug));
      const additions = slugs
        .filter((s) => !have.has(s))
        .map((slug) => ({
          slug,
          sets: Array.from({ length: DEFAULT_SET_ROWS }, emptySet),
        }));
      if (additions.length) setOpenIndex(prev.length);
      return [...prev, ...additions];
    });
    setPickerOpen(false);
  }

  function setSetValue(
    exIndex: number,
    setIndex: number,
    field: keyof TemplateSet,
    value: number,
  ) {
    updateExercise(exIndex, (ex) => ({
      ...ex,
      sets: ex.sets.map((s, i) =>
        i === setIndex ? { ...s, [field]: value } : s,
      ),
    }));
  }

  function addSetRow(exIndex: number) {
    updateExercise(exIndex, (ex) => ({
      // Seed the new row from the previous one to save typing.
      ...ex,
      sets: [...ex.sets, ex.sets[ex.sets.length - 1] ?? emptySet()],
    }));
  }

  function removeSetRow(exIndex: number, setIndex: number) {
    updateExercise(exIndex, (ex) => ({
      ...ex,
      sets:
        ex.sets.length > 1 ? ex.sets.filter((_, i) => i !== setIndex) : ex.sets,
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Notes are persisted separately via ExerciseNoteField; only slug + sets
      // belong on the template mutation payload.
      const payload = exercises.map(({ slug, sets }) => ({ slug, sets }));
      if (templateId) {
        await update({ templateId, name, exercises: payload });
      } else {
        await create({ name, exercises: payload });
      }
      toast.success("Template saved");
      router.push("/templates");
    } catch {
      toast.error("Couldn't save template");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!templateId) return;
    try {
      await remove({ templateId });
      toast.success("Template deleted");
      router.push("/templates");
    } catch {
      toast.error("Couldn't delete template");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={templateId ? "Edit template" : "New template"}
        backHref="/templates"
        action={
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        }
      />

      <div className="grid gap-2">
        <Label htmlFor="template-name">Template name</Label>
        <Input
          id="template-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Push Day"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-3 rounded-lg border bg-[var(--surface)] p-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-semibold">{exercises.length}</p>
            <p className="text-xs text-muted-foreground">exercises</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{setCount}</p>
            <p className="text-xs text-muted-foreground">sets</p>
          </div>
          <div>
            <p className="text-lg font-semibold">
              ~{estimateWorkoutMinutes(exercises.length, setCount)}
            </p>
            <p className="text-xs text-muted-foreground">min</p>
          </div>
        </div>
        <MuscleBand segments={muscleSegments} showLegend />
      </div>

      <div className="flex flex-col gap-3">
        <Label>Exercises</Label>
        {exercises.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
            No exercises yet. Add one below.
          </div>
        ) : (
          exercises.map((ex, exIndex) => {
            const isOpen = openIndex === exIndex;
            const maxWeight = Math.max(...ex.sets.map((s) => s.weight), 0);
            const reps = summarizeReps(ex.sets.map((s) => s.reps));
            return (
              <Card
                key={ex.slug}
                data-ex-index={exIndex}
                className={cn(
                  "gap-0 overflow-hidden py-0 transition-all",
                  drag?.from === exIndex && "scale-[0.99] opacity-70",
                  drag?.over === exIndex &&
                    drag.from !== exIndex &&
                    "border-foreground/50 bg-foreground/5",
                )}
              >
                <CardHeader className="flex flex-row items-center gap-1 space-y-0 px-3 py-3 sm:gap-2 sm:px-4">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground size-10 shrink-0 cursor-grab touch-none active:cursor-grabbing sm:size-9"
                    aria-label={`Reorder ${catalog.name(ex.slug)}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDrag({ from: exIndex, over: exIndex });
                    }}
                    onPointerMove={(event) => {
                      if (!drag) return;
                      dragOverFromPoint(event.clientX, event.clientY);
                    }}
                    onPointerUp={(event) => {
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                      reorder(drag?.from ?? exIndex, drag?.over ?? exIndex);
                    }}
                    onPointerCancel={() => setDrag(null)}
                  >
                    <GripVertical className="size-4" />
                  </Button>
                  <button
                    type="button"
                    className="min-w-0 flex-1 py-0.5 text-left"
                    onClick={() => setOpenIndex(isOpen ? -1 : exIndex)}
                  >
                    <CardTitle className="truncate text-base">
                      {catalog.name(ex.slug)}
                    </CardTitle>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {ex.sets.length} sets · {reps} reps · up to {maxWeight} lb
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-10 sm:size-9"
                      aria-label={
                        isOpen ? "Collapse exercise" : "Expand exercise"
                      }
                      onClick={() => setOpenIndex(isOpen ? -1 : exIndex)}
                    >
                      {isOpen ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive size-10 sm:size-9"
                      aria-label="Remove exercise"
                      onClick={() => removeExercise(exIndex)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardHeader>
                {isOpen ? (
                  <CardContent className="flex flex-col gap-2.5 px-3 pb-3 sm:px-4 sm:pb-4">
                    <ExerciseNoteField
                      key={`${ex.slug}-${ex.notes ?? notesBySlug[ex.slug] ?? ""}`}
                      exerciseSlug={ex.slug}
                      initialNotes={ex.notes ?? notesBySlug[ex.slug]}
                      compact
                    />
                    <div className="text-muted-foreground grid grid-cols-[1.75rem_minmax(0,1.2fr)_minmax(0,0.85fr)_2.5rem] items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase sm:gap-2">
                      <span className="text-center">Set</span>
                      <span>Weight</span>
                      <span>Reps</span>
                      <span />
                    </div>
                    {ex.sets.map((set, setIndex) => (
                      <div
                        key={setIndex}
                        className="grid grid-cols-[1.75rem_minmax(0,1.2fr)_minmax(0,0.85fr)_2.5rem] items-center gap-1.5 sm:gap-2"
                      >
                        <span className="text-muted-foreground text-center text-sm tabular-nums">
                          {setIndex + 1}
                        </span>
                        <LiftWeightInput
                          value={set.weight}
                          inputClassName="h-10 text-center sm:h-9"
                          aria-label={`Set ${setIndex + 1} weight`}
                          onCommit={(weight) =>
                            setSetValue(exIndex, setIndex, "weight", weight)
                          }
                          plateCalc={{
                            includeBar: catalog.usesBar(ex.slug),
                            onApply: (w) =>
                              setSetValue(exIndex, setIndex, "weight", w),
                            buttonAriaLabel: `Plates for set ${setIndex + 1}`,
                          }}
                        />
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={set.reps === 0 ? "" : String(set.reps)}
                          placeholder="0"
                          className="h-10 text-center sm:h-9"
                          aria-label={`Set ${setIndex + 1} reps`}
                          onFocus={selectNumericInput}
                          onChange={(e) =>
                            setSetValue(
                              exIndex,
                              setIndex,
                              "reps",
                              toWhole(e.target.value),
                            )
                          }
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground size-10 justify-self-center sm:size-9"
                          aria-label={`Remove set ${setIndex + 1}`}
                          disabled={ex.sets.length <= 1}
                          onClick={() => removeSetRow(exIndex, setIndex)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground -ml-2 self-start"
                      onClick={() => addSetRow(exIndex)}
                    >
                      <Plus className="size-4" />
                      Add set
                    </Button>
                  </CardContent>
                ) : null}
              </Card>
            );
          })
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full text-base"
          disabled={usedSlugs.size >= catalog.all.length}
          onClick={() => {
            setPickerKey((k) => k + 1);
            setPickerOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add exercise
        </Button>
      </div>

      {templateId ? <DeleteTemplateButton onConfirm={handleDelete} /> : null}

      <ExercisePicker
        key={pickerKey}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        usedSlugs={exercises.map((e) => e.slug)}
        onAdd={addExercises}
      />
    </div>
  );
}

function summarizeReps(reps: number[]): string {
  const valid = reps.filter((r) => r > 0);
  if (valid.length === 0) return "target";
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  return min === max ? String(min) : `${min}-${max}`;
}

function DeleteTemplateButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="text-destructive hover:text-destructive w-full"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        Delete template
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this template?</DialogTitle>
          <DialogDescription>
            This removes the template and its exercises. Past workout history is
            kept.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
