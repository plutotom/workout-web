"use client";

import { useLayoutEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVisualViewportFrame } from "@/hooks/use-visual-viewport-frame";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/exercises";
import { cn } from "@/lib/utils";

export type EditableCustomExercise = {
  id: Id<"customExercises">;
  name: string;
  category: MuscleGroup;
  usesBar: boolean;
};

export function CustomExerciseDialog({
  open,
  onOpenChange,
  defaultGroup,
  onCreated,
  exercise,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGroup: MuscleGroup;
  onCreated?: (slug: string) => void;
  exercise?: EditableCustomExercise;
}) {
  const create = useMutation(api.routes.exercises.mutations.create);
  const update = useMutation(api.routes.exercises.mutations.update);
  const editing = exercise !== undefined;

  const [name, setName] = useState(exercise?.name ?? "");
  const [category, setCategory] = useState<MuscleGroup>(
    exercise?.category ?? defaultGroup,
  );
  const [usesBar, setUsesBar] = useState(exercise?.usesBar ?? false);
  const [saving, setSaving] = useState(false);
  const [compact, setCompact] = useState(false);
  const { style: viewportStyle, keyboardOpen } = useVisualViewportFrame(
    open && compact,
    { mode: "dock" },
  );

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function reset() {
    setName(exercise?.name ?? "");
    setCategory(exercise?.category ?? defaultGroup);
    setUsesBar(exercise?.usesBar ?? false);
  }

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (editing) {
        await update({
          exerciseId: exercise.id,
          name: trimmed,
          category,
          usesBar,
        });
        toast.success("Exercise updated");
        onOpenChange(false);
      } else {
        const { slug } = await create({ name: trimmed, category, usesBar });
        toast.success("Exercise created");
        reset();
        onCreated?.(slug);
        onOpenChange(false);
      }
    } catch {
      toast.error(
        editing ? "Couldn't update exercise" : "Couldn't create exercise",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset();
        else reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        style={viewportStyle}
        className={cn(keyboardOpen && "pb-3")}
      >
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit exercise" : "New custom exercise"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="custom-exercise-name">Name</Label>
            <Input
              id="custom-exercise-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cable Pull-Through"
              autoComplete="off"
              autoFocus
              className="text-base"
            />
          </div>

          <div className="grid gap-2">
            <Label>Muscle group</Label>
            <div className="flex flex-wrap gap-2">
              {MUSCLE_GROUPS.map((g) => (
                <Button
                  key={g.id}
                  type="button"
                  size="sm"
                  variant={category === g.id ? "default" : "outline"}
                  onClick={() => setCategory(g.id)}
                >
                  {g.label}
                </Button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setUsesBar((v) => !v)}
            className="flex min-h-11 items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm"
          >
            <span>
              <span className="font-medium">Uses a barbell</span>
              <span className="text-muted-foreground block text-xs">
                Includes the bar in plate-calculator math
              </span>
            </span>
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded border",
                usesBar ? "border-success bg-success/15" : "border-input",
              )}
            >
              {usesBar ? <Check className="text-success size-3.5" /> : null}
            </span>
          </button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={name.trim().length === 0 || saving}
            onClick={() => void handleSubmit()}
          >
            {saving
              ? editing
                ? "Saving…"
                : "Creating…"
              : editing
                ? "Save"
                : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
