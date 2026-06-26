"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/exercises";
import { cn } from "@/lib/utils";

type ExercisePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usedSlugs: string[];
  onAdd: (slugs: string[]) => void;
};

/** A custom-exercise slug looks like `custom:<id>`; null for curated lifts. */
function customExerciseId(slug: string): Id<"customExercises"> | null {
  return slug.startsWith("custom:")
    ? (slug.slice("custom:".length) as Id<"customExercises">)
    : null;
}

export function ExercisePicker({
  open,
  onOpenChange,
  usedSlugs,
  onAdd,
}: ExercisePickerProps) {
  const catalog = useExerciseCatalog();
  const archive = useMutation(api.routes.exercises.mutations.archive);

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const usedSet = new Set(usedSlugs);
  const results = catalog.search(query, group);

  function toggleSlug(slug: string) {
    setSelected((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function handleAdd() {
    if (selected.length === 0) return;
    onAdd(selected);
    onOpenChange(false);
  }

  async function handleArchive(slug: string) {
    const id = customExerciseId(slug);
    if (!id) return;
    setSelected((prev) => prev.filter((s) => s !== slug));
    try {
      await archive({ exerciseId: id });
      toast.success("Exercise removed");
    } catch {
      toast.error("Couldn't remove exercise");
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[85vh] flex-col gap-0 p-0"
        >
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Add exercises</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4 pt-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises"
              autoComplete="off"
            />

            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Button
                type="button"
                size="sm"
                variant={group === "all" ? "default" : "outline"}
                className="shrink-0"
                onClick={() => setGroup("all")}
              >
                All
              </Button>
              {MUSCLE_GROUPS.map((g) => (
                <Button
                  key={g.id}
                  type="button"
                  size="sm"
                  variant={group === g.id ? "default" : "outline"}
                  className="shrink-0"
                  onClick={() => setGroup(g.id)}
                >
                  {g.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
            <Button
              type="button"
              variant="outline"
              className="border-dashed"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
              New custom exercise
            </Button>

            {results.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No matches
              </p>
            ) : (
              results.map((e) => {
                const isUsed = usedSet.has(e.slug);
                const isSelected = selected.includes(e.slug);
                return (
                  <div
                    key={e.slug}
                    className={cn(
                      "flex items-center gap-2 rounded-md border text-sm transition-colors",
                      isUsed && "text-muted-foreground opacity-60",
                      !isUsed &&
                        isSelected &&
                        "border-success/40 bg-success/10",
                      !isUsed && !isSelected && "border-transparent",
                    )}
                  >
                    <button
                      type="button"
                      disabled={isUsed}
                      onClick={() => toggleSlug(e.slug)}
                      className={cn(
                        "flex flex-1 items-center gap-2 px-3 py-2.5 text-left",
                        isUsed
                          ? "cursor-not-allowed"
                          : !isSelected && "hover:bg-accent rounded-md",
                      )}
                    >
                      <span className="flex-1">{e.name}</span>
                      {e.custom ? (
                        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                          Custom
                        </span>
                      ) : null}
                      {isUsed ? (
                        <span className="text-muted-foreground text-xs">
                          Added
                        </span>
                      ) : isSelected ? (
                        <Check className="text-success size-4 shrink-0" />
                      ) : null}
                    </button>
                    {e.custom ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive mr-1 size-8 shrink-0"
                        aria-label={`Remove ${e.name}`}
                        onClick={() => handleArchive(e.slug)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          <SheetFooter className="flex-row border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={selected.length === 0}
              onClick={handleAdd}
            >
              Add ({selected.length})
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CreateExerciseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultGroup={group === "all" ? "chest" : group}
        onCreated={(slug) => {
          setSelected((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
          setCreateOpen(false);
        }}
      />
    </>
  );
}

function CreateExerciseDialog({
  open,
  onOpenChange,
  defaultGroup,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGroup: MuscleGroup;
  onCreated: (slug: string) => void;
}) {
  const create = useMutation(api.routes.exercises.mutations.create);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<MuscleGroup>(defaultGroup);
  const [usesBar, setUsesBar] = useState(false);
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setCategory(defaultGroup);
    setUsesBar(false);
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const { slug } = await create({ name: trimmed, category, usesBar });
      toast.success("Exercise created");
      reset();
      onCreated(slug);
    } catch {
      toast.error("Couldn't create exercise");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New custom exercise</DialogTitle>
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
            className="flex items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm"
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
            onClick={handleCreate}
          >
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
