"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  MUSCLE_GROUPS,
  searchExercises,
  type MuscleGroup,
} from "@/lib/exercises";
import { cn } from "@/lib/utils";

type ExercisePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usedSlugs: string[];
  onAdd: (slugs: string[]) => void;
};

export function ExercisePicker({
  open,
  onOpenChange,
  usedSlugs,
  onAdd,
}: ExercisePickerProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);

  const usedSet = new Set(usedSlugs);
  const results = searchExercises(query, group);

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

  return (
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
          {results.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No matches
            </p>
          ) : (
            results.map((e) => {
              const isUsed = usedSet.has(e.slug);
              const isSelected = selected.includes(e.slug);
              return (
                <button
                  key={e.slug}
                  type="button"
                  disabled={isUsed}
                  onClick={() => toggleSlug(e.slug)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                    isUsed &&
                      "text-muted-foreground cursor-not-allowed opacity-60",
                    !isUsed && isSelected && "border-success/40 bg-success/10",
                    !isUsed &&
                      !isSelected &&
                      "hover:bg-accent border-transparent",
                  )}
                >
                  <span className="flex-1">{e.name}</span>
                  {isUsed ? (
                    <span className="text-muted-foreground text-xs">Added</span>
                  ) : isSelected ? (
                    <Check className="text-success size-4 shrink-0" />
                  ) : null}
                </button>
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
  );
}
