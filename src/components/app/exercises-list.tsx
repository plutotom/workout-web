"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@backend/api";
import { CustomExerciseDialog } from "@/components/app/custom-exercise-dialog";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  browseExercises,
  exerciseDetailPath,
  EXERCISE_SORTS,
  muscleGroupLabel,
  type ExerciseSort,
} from "@/lib/exercise-browser";
import { MUSCLE_GROUPS, type MuscleGroup } from "@/lib/exercises";
import { cn } from "@/lib/utils";

export function ExercisesList({
  customOnly = false,
}: {
  customOnly?: boolean;
}) {
  const catalog = useExerciseCatalog();
  const router = useRouter();
  const lifts = useQuery(api.routes.insights.queries.lifts, { days: null });

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [sort, setSort] = useState<ExerciseSort>("az");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [muscleOpen, setMuscleOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const lastUsedAt = useMemo(() => {
    const map = new Map<string, number>();
    for (const lift of lifts ?? []) {
      map.set(lift.slug, lift.lastCompletedAt);
    }
    return map;
  }, [lifts]);

  const rows = useMemo(
    () =>
      browseExercises(catalog.all, catalog.archived, {
        query,
        group,
        sort,
        lastUsedAt,
        includeArchived,
        customOnly,
      }),
    [
      catalog.all,
      catalog.archived,
      query,
      group,
      sort,
      lastUsedAt,
      includeArchived,
      customOnly,
    ],
  );

  const muscleLabel = group === "all" ? "All muscles" : muscleGroupLabel(group);
  const sortLabel = EXERCISE_SORTS.find((s) => s.id === sort)?.label ?? "A–Z";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Exercises"
        backHref="/insights"
        action={
          <Button
            type="button"
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="min-h-11"
          >
            <Plus className="size-4" />
            Create
          </Button>
        }
      />

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          e.currentTarget.querySelector("input")?.blur();
        }}
      >
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
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
            className="h-11 pl-9 text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 justify-between text-base"
            onClick={() => setMuscleOpen(true)}
          >
            <span className="truncate">{muscleLabel}</span>
            <ChevronRight className="size-4 shrink-0 rotate-90" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 justify-between text-base"
            onClick={() => setSortOpen(true)}
          >
            <span className="truncate">{sortLabel}</span>
            <ChevronRight className="size-4 shrink-0 rotate-90" />
          </Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          No matches
        </p>
      ) : (
        <ul className="divide-border -mx-3 divide-y">
          {rows.map((exercise) => (
            <li key={exercise.slug}>
              <Link
                href={exerciseDetailPath(exercise.slug)}
                className="flex min-h-14 items-center gap-3 px-3 py-3 active:bg-muted/40"
              >
                <span
                  className="bg-muted size-2.5 shrink-0 rounded-full"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">
                      {exercise.name}
                    </span>
                    {exercise.custom ? (
                      <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                        {exercise.archived ? "Archived" : "Custom"}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground block truncate text-sm">
                    {muscleGroupLabel(exercise.category)}
                  </span>
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CustomExerciseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultGroup={group === "all" ? "chest" : group}
        onCreated={(slug) => {
          router.push(exerciseDetailPath(slug));
        }}
      />

      <OptionSheet
        open={muscleOpen}
        onOpenChange={setMuscleOpen}
        title="Muscle group"
      >
        <OptionButton
          selected={group === "all"}
          onClick={() => {
            setGroup("all");
            setMuscleOpen(false);
          }}
        >
          All muscles
        </OptionButton>
        {MUSCLE_GROUPS.map((g) => (
          <OptionButton
            key={g.id}
            selected={group === g.id}
            onClick={() => {
              setGroup(g.id);
              setMuscleOpen(false);
            }}
          >
            {g.label}
          </OptionButton>
        ))}
      </OptionSheet>

      <OptionSheet open={sortOpen} onOpenChange={setSortOpen} title="Sort">
        {EXERCISE_SORTS.map((s) => (
          <OptionButton
            key={s.id}
            selected={sort === s.id}
            onClick={() => {
              setSort(s.id);
              setSortOpen(false);
            }}
          >
            {s.label}
          </OptionButton>
        ))}
        <button
          type="button"
          onClick={() => setIncludeArchived((v) => !v)}
          className="mt-2 flex min-h-11 w-full items-center justify-between rounded-lg border px-3 text-left text-base"
        >
          <span>Show archived</span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded border",
              includeArchived ? "border-success bg-success/15" : "border-input",
            )}
            aria-hidden
          >
            {includeArchived ? (
              <span className="bg-success size-2.5 rounded-sm" />
            ) : null}
          </span>
        </button>
      </OptionSheet>
    </div>
  );
}

function OptionSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function OptionButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-base",
        selected ? "bg-muted font-medium" : "hover:bg-muted/50",
      )}
    >
      {children}
    </button>
  );
}
