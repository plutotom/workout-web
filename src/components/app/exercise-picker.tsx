"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Check, Layers, Plus, Trash2 } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

/** Map exercise slug → template names that include it. */
function templateNamesBySlug(
  templates: { name: string; exercises: { slug: string }[] }[] | undefined,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!templates) return map;
  for (const t of templates) {
    for (const e of t.exercises) {
      const names = map.get(e.slug);
      if (names) names.push(t.name);
      else map.set(e.slug, [t.name]);
    }
  }
  return map;
}

export function ExercisePicker({
  open,
  onOpenChange,
  usedSlugs,
  onAdd,
}: ExercisePickerProps) {
  const catalog = useExerciseCatalog();
  const archive = useMutation(api.routes.exercises.mutations.archive);
  const templates = useQuery(
    api.routes.templates.queries.list,
    open ? {} : "skip",
  );

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const usedSet = new Set(usedSlugs);
  const inTemplates = templateNamesBySlug(templates);
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
    <TooltipProvider>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="flex max-h-[85dvh] flex-col gap-0 p-0"
        >
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Add exercises</SheetTitle>
          </SheetHeader>

          <form
            className="flex flex-col gap-3 px-4 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.querySelector("input");
              input?.blur();
            }}
          >
            <Input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search exercises"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
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
          </form>

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
                const templateNames = inTemplates.get(e.slug);
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
                    {templateNames && templateNames.length > 0 ? (
                      <TemplateUsageHint
                        names={templateNames}
                        className={e.custom ? undefined : "mr-1"}
                      />
                    ) : null}
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
    </TooltipProvider>
  );
}

/** Layers icon + fast styled tooltip listing templates that include this exercise. */
function TemplateUsageHint({
  names,
  className,
}: {
  names: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = `Used in ${names.join(", ")}`;

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
            className,
          )}
          aria-label={label}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
        >
          <Layers className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" className="max-w-52">
        <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-[0.16em] uppercase">
          Used in
        </p>
        <ul className="flex flex-col gap-0.5">
          {names.map((name) => (
            <li key={name} className="text-foreground truncate text-xs">
              {name}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
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
