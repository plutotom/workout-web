"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
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

const DEFAULT_SET_ROWS = 3;
const emptySet = () => ({ weight: 0, reps: 0 });

type TemplateSet = { weight: number; reps: number };
type EditorExercise = { slug: string; sets: TemplateSet[]; notes?: string };

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

  const slugs = exercises.map((e) => e.slug);
  const fetchedNotes = useQuery(api.routes.exercises.queries.getNotes, {
    slugs,
  });
  const notesBySlug = fetchedNotes ?? {};

  const usedSlugs = new Set(exercises.map((e) => e.slug));
  const canSave = name.trim().length > 0 && exercises.length > 0 && !saving;

  function updateExercise(
    index: number,
    fn: (ex: EditorExercise) => EditorExercise,
  ) {
    setExercises((prev) => prev.map((e, i) => (i === index ? fn(e) : e)));
  }

  function move(index: number, delta: number) {
    setExercises((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
      if (templateId) {
        await update({ templateId, name, exercises });
      } else {
        await create({ name, exercises });
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

      <div className="flex flex-col gap-3">
        <Label>Exercises</Label>
        {exercises.length === 0 ? (
          <div className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
            No exercises yet. Add one below.
          </div>
        ) : (
          exercises.map((ex, exIndex) => (
            <Card key={ex.slug}>
              <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-0">
                <CardTitle className="text-base">
                  {catalog.name(ex.slug)}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Move up"
                    disabled={exIndex === 0}
                    onClick={() => move(exIndex, -1)}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Move down"
                    disabled={exIndex === exercises.length - 1}
                    onClick={() => move(exIndex, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive size-8"
                    aria-label="Remove exercise"
                    onClick={() => removeExercise(exIndex)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ExerciseNoteField
                  key={`${ex.slug}-${ex.notes ?? notesBySlug[ex.slug] ?? ""}`}
                  exerciseSlug={ex.slug}
                  initialNotes={ex.notes ?? notesBySlug[ex.slug]}
                />
                <div className="text-muted-foreground grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 px-1 text-xs font-medium tracking-wide uppercase">
                  <span>Set</span>
                  <span>Weight</span>
                  <span>Reps</span>
                  <span />
                </div>
                {ex.sets.map((set, setIndex) => (
                  <div
                    key={setIndex}
                    className="grid grid-cols-[2rem_1fr_1fr_2rem] items-center gap-2 px-1"
                  >
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {setIndex + 1}
                    </span>
                    <LiftWeightInput
                      value={set.weight}
                      inputClassName="h-9 text-center"
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
                      className="h-9 text-center"
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
                      className="text-muted-foreground hover:text-foreground size-8 justify-self-center"
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
                  className="mt-1 self-start"
                  onClick={() => addSetRow(exIndex)}
                >
                  <Plus className="size-4" />
                  Add set
                </Button>
              </CardContent>
            </Card>
          ))
        )}

        <Button
          type="button"
          variant="outline"
          className="w-full"
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
