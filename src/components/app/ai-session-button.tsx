"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useVisualViewportFrame } from "@/hooks/use-visual-viewport-frame";
import type { SessionDraft } from "@/lib/ai/session-draft";
import { cn } from "@/lib/utils";

type CurrentExercise = {
  slug: string;
  sets: { completed: boolean; weight: number; reps: number }[];
};

type ReviewState = {
  draft: SessionDraft;
  droppedSlugs: string[];
  selectedAdd: Set<string>;
  selectedRemove: Set<string>;
};

function newGenerationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function setSummary(sets: { weight: number; reps: number }[]): string {
  if (sets.length === 0) return "1 set";
  const reps = sets.map((s) => s.reps);
  const allSame = reps.every((r) => r === reps[0]);
  if (allSame && reps[0] === 0) {
    return `${sets.length} sets`;
  }
  if (allSame) {
    return `${sets.length} × ${reps[0]}`;
  }
  return `${sets.length} sets`;
}

function ToggleRow({
  on,
  title,
  subtitle,
  onToggle,
  danger,
}: {
  on: boolean;
  title: string;
  subtitle?: string;
  onToggle: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors",
        on
          ? danger
            ? "border-destructive/40 bg-destructive/5"
            : "border-foreground/40 bg-foreground/5"
          : "border-[var(--line)] bg-[var(--surface)] opacity-60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border",
          on
            ? danger
              ? "border-destructive bg-destructive text-white"
              : "border-foreground bg-foreground text-background"
            : "border-muted-foreground/40",
        )}
        aria-hidden
      >
        {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{title}</span>
        {subtitle ? (
          <span className="text-muted-foreground text-xs">{subtitle}</span>
        ) : null}
      </span>
    </button>
  );
}

export function AiSessionButton({
  sessionId,
  current,
  className,
  variant = "outline",
  label,
}: {
  sessionId: Id<"workoutSessions">;
  current: CurrentExercise[];
  className?: string;
  variant?: "outline" | "default";
  label?: string;
}) {
  const catalog = useExerciseCatalog();
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  const applyDraft = useMutation(
    api.routes.workouts.mutations.addExercisesFromDraft,
  );
  const undoGeneration = useMutation(
    api.routes.workouts.mutations.undoAiGeneration,
  );
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { style: viewportStyle, keyboardOpen: viewportKeyboard } =
    useVisualViewportFrame(open);
  // Soft-keyboard chrome only — don't tie to input focus or Cancel/footer
  // toggles when focusing the textarea on desktop.
  const keyboardOpen = viewportKeyboard;
  const compactInput = viewportKeyboard || inputFocused;

  const isPro = entitlement?.isPro === true;
  const entitlementLoading = entitlement === undefined;
  const isEmpty = current.length === 0;
  const buttonLabel = label ?? (isEmpty ? "Describe with AI" : "Edit with AI");
  const step = review ? "review" : "prompt";

  useEffect(() => {
    if (!open || !isPro || step !== "prompt") return;
    const id = window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(id);
  }, [open, isPro, step]);

  function resetSheet() {
    setPrompt("");
    setReview(null);
    setInputFocused(false);
    setGenerating(false);
    setApplying(false);
  }

  function closeSheet() {
    setOpen(false);
    resetSheet();
  }

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Describe the change first");
      return;
    }
    if (!isPro) {
      toast.error("AI workouts require Pro");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/ai/session/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          current: {
            exercises: current.map(({ slug, sets }) => ({
              slug,
              sets: sets.map((s) => ({
                completed: s.completed,
                weight: s.weight,
                reps: s.reps,
              })),
            })),
          },
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        code?: string;
        draft?: SessionDraft;
        droppedSlugs?: string[];
      };

      if (!res.ok) {
        if (data.code === "PRO_REQUIRED") {
          toast.error("AI workouts require Pro");
        } else {
          toast.error(data.error ?? "Couldn't generate changes");
        }
        return;
      }

      if (
        !data.draft ||
        (data.draft.add.length === 0 && data.draft.removeSlugs.length === 0)
      ) {
        toast.error("Couldn't generate changes");
        return;
      }

      setInputFocused(false);
      setReview({
        draft: data.draft,
        droppedSlugs: data.droppedSlugs ?? [],
        selectedAdd: new Set(data.draft.add.map((e) => e.slug)),
        selectedRemove: new Set(data.draft.removeSlugs),
      });
    } catch {
      toast.error("Couldn't generate changes");
    } finally {
      setGenerating(false);
    }
  }

  function toggleAdd(slug: string) {
    setReview((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedAdd);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return { ...prev, selectedAdd: next };
    });
  }

  function toggleRemove(slug: string) {
    setReview((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selectedRemove);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return { ...prev, selectedRemove: next };
    });
  }

  async function handleAccept() {
    if (!review) return;
    const exercises = review.draft.add.filter((e) =>
      review.selectedAdd.has(e.slug),
    );
    const removeSlugs = review.draft.removeSlugs.filter((s) =>
      review.selectedRemove.has(s),
    );
    if (exercises.length === 0 && removeSlugs.length === 0) {
      toast.error("Select at least one change");
      return;
    }

    const generationId = newGenerationId();
    setApplying(true);
    try {
      const result = await applyDraft({
        sessionId,
        exercises,
        removeSlugs,
        aiGenerationId: generationId,
      });

      closeSheet();

      const parts: string[] = [];
      if (result.removedCount > 0) {
        parts.push(`removed ${result.removedCount}`);
      }
      if (result.ids.length > 0) {
        parts.push(`added ${result.ids.length}`);
      }
      const summary =
        parts.length > 0 ? parts.join(", ") : "Applied AI changes";

      toast.success(summary.charAt(0).toUpperCase() + summary.slice(1), {
        description: review.droppedSlugs.length
          ? `Skipped: ${review.droppedSlugs.join(", ")}`
          : undefined,
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () => {
            void undoGeneration({
              sessionId,
              generationId: result.generationId ?? generationId,
            })
              .then(({ removed, kept, restored }) => {
                if (removed === 0 && restored === 0) {
                  toast.message("Nothing to undo", {
                    description:
                      kept > 0
                        ? "New lifts already have logged sets."
                        : undefined,
                  });
                  return;
                }
                const bits: string[] = [];
                if (removed > 0)
                  bits.push(`undid ${removed} add${removed === 1 ? "" : "s"}`);
                if (restored > 0) bits.push(`restored ${restored}`);
                toast.success(bits.join(", "), {
                  description:
                    kept > 0
                      ? `Kept ${kept} new lift${kept === 1 ? "" : "s"} with logged sets.`
                      : undefined,
                });
              })
              .catch(() => toast.error("Couldn't undo"));
          },
        },
      });
    } catch {
      toast.error("Couldn't apply AI changes");
    } finally {
      setApplying(false);
    }
  }

  const addCount = review?.selectedAdd.size ?? 0;
  const removeCount = review?.selectedRemove.size ?? 0;
  const changeCount = addCount + removeCount;
  const keepList = current.filter((ex) => !review?.selectedRemove.has(ex.slug));
  const removeCandidates = current.filter((ex) =>
    review?.draft.removeSlugs.includes(ex.slug),
  );

  return (
    <>
      <Button
        type="button"
        size="lg"
        variant={variant}
        className={cn("w-full text-base", className)}
        disabled={entitlementLoading}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" />
        {buttonLabel}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) closeSheet();
          else setOpen(true);
        }}
      >
        <SheetContent
          side="bottom"
          style={viewportStyle}
          className={cn(
            "flex flex-col gap-0 overflow-hidden rounded-none border-0 p-0",
            !viewportStyle && "h-dvh max-h-dvh",
          )}
        >
          <div className="flex shrink-0 justify-center pt-3 pb-1">
            <div className="bg-muted-foreground/30 h-1 w-10 rounded-full" />
          </div>

          <SheetHeader className="shrink-0 gap-1 px-4 pt-2 pr-12 text-left">
            <SheetTitle className="text-lg">
              {step === "review"
                ? "Review AI changes"
                : isEmpty
                  ? "Describe your workout"
                  : "Edit workout with AI"}
            </SheetTitle>
            <SheetDescription
              className={cn(keyboardOpen && step === "prompt" && "sr-only")}
            >
              {!isPro
                ? "AI workout generation is a Pro feature."
                : step === "review"
                  ? "Confirm removals and additions. Nothing changes until you apply."
                  : "Describe what to add, remove, or reshape. You’ll review first."}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3">
            {!isPro ? (
              <p className="text-muted-foreground text-sm">
                Upgrade to Pro to reshape workouts with AI. You can upgrade
                under{" "}
                <Link href="/settings" className="text-foreground underline">
                  Settings
                </Link>
                .
                {entitlement?.allowManualPro ? (
                  <> For testing, you can also enable Pro there.</>
                ) : null}
              </p>
            ) : step === "prompt" ? (
              <div className="grid gap-2">
                <Label htmlFor="ai-session-prompt">What should change?</Label>
                <Textarea
                  ref={textareaRef}
                  id="ai-session-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder={
                    isEmpty
                      ? "e.g. Push day: bench, OHP, dips — 4 sets of 8–10"
                      : "e.g. Keep only the first lift, remove the rest, add deadlift 3x5"
                  }
                  rows={compactInput ? 4 : 5}
                  className={cn(
                    "text-base",
                    compactInput ? "min-h-[6rem]" : "min-h-[8.5rem]",
                  )}
                  disabled={generating}
                />
              </div>
            ) : review ? (
              <div className="flex flex-col gap-4 pb-2">
                <p className="text-muted-foreground text-sm">
                  {[
                    removeCount > 0 ? `Remove ${removeCount}` : null,
                    addCount > 0 ? `Add ${addCount}` : null,
                    keepList.length > 0 && current.length > 0
                      ? `Keep ${keepList.length}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No changes selected"}
                </p>

                {removeCandidates.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Removing
                    </p>
                    <ul className="flex flex-col gap-2">
                      {removeCandidates.map((ex) => {
                        const done = ex.sets.filter((s) => s.completed).length;
                        return (
                          <li key={ex.slug}>
                            <ToggleRow
                              danger
                              on={review.selectedRemove.has(ex.slug)}
                              title={catalog.name(ex.slug)}
                              subtitle={`${done}/${ex.sets.length} done${
                                done > 0 ? " · includes logged sets" : ""
                              }`}
                              onToggle={() => toggleRemove(ex.slug)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {keepList.length > 0 && removeCandidates.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Keeping
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {keepList.map((ex) => {
                        const done = ex.sets.filter((s) => s.completed).length;
                        return (
                          <li
                            key={ex.slug}
                            className="text-muted-foreground flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="truncate">
                              {catalog.name(ex.slug)}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {done}/{ex.sets.length} done
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {review.draft.add.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                      Adding
                    </p>
                    <ul className="flex flex-col gap-2">
                      {review.draft.add.map((ex) => (
                        <li key={ex.slug}>
                          <ToggleRow
                            on={review.selectedAdd.has(ex.slug)}
                            title={catalog.name(ex.slug)}
                            subtitle={`${setSummary(ex.sets)}${
                              ex.sets.some((s) => s.weight > 0)
                                ? ` · up to ${Math.max(...ex.sets.map((s) => s.weight))} lb`
                                : ""
                            }`}
                            onToggle={() => toggleAdd(ex.slug)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {review.droppedSlugs.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Skipped: {review.droppedSlugs.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <SheetFooter
            className={cn(
              "mt-0 shrink-0 gap-2 border-t px-4 pt-3 sm:flex-col",
              "pb-[max(1rem,env(safe-area-inset-bottom))]",
            )}
          >
            {!isPro ? (
              <Button type="button" size="lg" className="h-12 w-full" asChild>
                <Link href="/settings">Go to Settings</Link>
              </Button>
            ) : step === "prompt" ? (
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
              >
                <Sparkles className="size-4" />
                {generating ? "Generating…" : "Preview"}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                onClick={handleAccept}
                disabled={applying || changeCount === 0}
              >
                {applying ? "Applying…" : "Apply changes"}
              </Button>
            )}

            {step === "review" ? (
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="h-11 flex-1 text-base"
                  onClick={() => setReview(null)}
                  disabled={applying}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="h-11 flex-1 text-base"
                  onClick={closeSheet}
                  disabled={applying}
                >
                  Discard
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-11 w-full text-base"
                onClick={closeSheet}
                disabled={generating}
              >
                Cancel
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
