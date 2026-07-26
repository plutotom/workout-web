"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { api } from "@backend/api";
import { GeneratingLoader } from "@/components/app/generating-loader";
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
import { describeAiGenerateFailure } from "@/lib/ai/generate-feedback";
import type { TemplateDraft } from "@/lib/ai/template-draft";
import { cn } from "@/lib/utils";

type CurrentTemplate = {
  name: string;
  exercises: { slug: string; sets: { weight: number; reps: number }[] }[];
};

export function AiTemplateButton({
  mode,
  current,
  onApply,
  className,
}: {
  mode: "create" | "edit";
  current: CurrentTemplate;
  onApply: (draft: TemplateDraft) => void;
  className?: string;
}) {
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<{
    title: string;
    description?: string;
  } | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Fill mode pins the sheet to the visual viewport so iOS keyboard
  // resize/scroll can't leave a dead gap under the sheet.
  const { style: viewportStyle, keyboardOpen: viewportKeyboard } =
    useVisualViewportFrame(open);
  // Soft-keyboard chrome only — don't hide Cancel just because the textarea is focused.
  const keyboardOpen = viewportKeyboard;
  const compactInput = viewportKeyboard || inputFocused;

  const isPro = entitlement?.isPro === true;
  const entitlementLoading = entitlement === undefined;

  useEffect(() => {
    if (!open || !isPro) return;
    const id = window.setTimeout(() => {
      textareaRef.current?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(id);
  }, [open, isPro]);

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Describe the workout first");
      return;
    }
    if (!isPro) {
      toast.error("AI templates require Pro");
      return;
    }

    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/ai/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          mode,
          current:
            mode === "edit"
              ? {
                  name: current.name,
                  exercises: current.exercises.map(({ slug, sets }) => ({
                    slug,
                    sets,
                  })),
                }
              : undefined,
        }),
      });

      let data: {
        error?: string;
        code?: string;
        hint?: string;
        draft?: TemplateDraft;
        droppedSlugs?: string[];
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        data = {};
      }

      if (!res.ok) {
        const feedback = describeAiGenerateFailure(
          data,
          "Couldn't generate template",
        );
        setGenerateError(feedback);
        toast.error(
          feedback.title,
          feedback.description
            ? { description: feedback.description }
            : undefined,
        );
        return;
      }

      if (!data.draft) {
        const feedback = {
          title: "Couldn't generate template",
          description: "The response was empty. Try again.",
        };
        setGenerateError(feedback);
        toast.error(feedback.title, { description: feedback.description });
        return;
      }

      onApply(data.draft);
      setOpen(false);
      setPrompt("");
      setGenerateError(null);
      if (data.droppedSlugs?.length) {
        toast.message("Draft applied", {
          description: `Skipped unknown exercises: ${data.droppedSlugs.join(", ")}`,
        });
      } else {
        toast.success(
          mode === "edit"
            ? "Template updated from AI"
            : "Draft applied — review and save",
        );
      }
    } catch {
      const feedback = {
        title: "Couldn't generate template",
        description: "Network error. Check your connection and retry.",
      };
      setGenerateError(feedback);
      toast.error(feedback.title, { description: feedback.description });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="lg"
        variant="outline"
        className={cn("w-full text-base", className)}
        disabled={entitlementLoading}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" />
        {mode === "edit" ? "Edit with AI" : "Describe with AI"}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setInputFocused(false);
            setGenerateError(null);
          }
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
              {mode === "edit"
                ? "Edit template with AI"
                : "Describe your workout"}
            </SheetTitle>
            <SheetDescription className={cn(keyboardOpen && "sr-only")}>
              {isPro
                ? mode === "edit"
                  ? "Say what to change. Draft only — nothing saves until you hit Save."
                  : "Describe the session. Draft only — nothing saves until you hit Save."
                : "AI template generation is a Pro feature."}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3">
            {isPro && generating ? (
              <GeneratingLoader label="Building your template…" />
            ) : isPro ? (
              <div className="grid gap-2">
                <Label htmlFor="ai-template-prompt">
                  {mode === "edit" ? "What should change?" : "Description"}
                </Label>
                <Textarea
                  ref={textareaRef}
                  id="ai-template-prompt"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (generateError) setGenerateError(null);
                  }}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder={
                    mode === "edit"
                      ? "e.g. Swap bench for dumbbell press and add lateral raises"
                      : "e.g. Push day: bench, OHP, dips, lateral raises — 4 sets of 8–10"
                  }
                  rows={compactInput ? 4 : 5}
                  className={cn(
                    "text-base",
                    compactInput ? "min-h-[6rem]" : "min-h-[8.5rem]",
                  )}
                  disabled={generating}
                />
                {generateError ? (
                  <div
                    role="alert"
                    className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{generateError.title}</p>
                    {generateError.description ? (
                      <p className="text-destructive/90 mt-0.5 leading-snug">
                        {generateError.description}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Upgrade to Pro to generate or edit templates from a description.
                You can upgrade under{" "}
                <Link href="/settings" className="text-foreground underline">
                  Settings
                </Link>
                .
                {entitlement?.allowManualPro ? (
                  <> For testing, you can also enable Pro there.</>
                ) : null}
              </p>
            )}
          </div>

          <SheetFooter
            className={cn(
              "mt-0 shrink-0 gap-2 border-t px-4 pt-3 sm:flex-col",
              "pb-[max(1rem,env(safe-area-inset-bottom))]",
            )}
          >
            {isPro ? (
              <Button
                type="button"
                size="lg"
                className="h-12 w-full text-base"
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
              >
                <Sparkles className="size-4" />
                {generating ? "Generating…" : "Generate"}
              </Button>
            ) : (
              <Button type="button" size="lg" className="h-12 w-full" asChild>
                <Link href="/settings">Go to Settings</Link>
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 w-full text-base"
              onClick={() => setOpen(false)}
              disabled={generating}
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
