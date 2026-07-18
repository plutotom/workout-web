"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { api } from "@backend/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateDraft } from "@/lib/ai/template-draft";

type CurrentTemplate = {
  name: string;
  exercises: { slug: string; sets: { weight: number; reps: number }[] }[];
};

export function AiTemplateButton({
  mode,
  current,
  onApply,
}: {
  mode: "create" | "edit";
  current: CurrentTemplate;
  onApply: (draft: TemplateDraft) => void;
}) {
  const entitlement = useQuery(api.routes.auth.users.entitlement);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  const isPro = entitlement?.isPro === true;
  const entitlementLoading = entitlement === undefined;

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

      const data = (await res.json()) as {
        error?: string;
        code?: string;
        draft?: TemplateDraft;
        droppedSlugs?: string[];
      };

      if (!res.ok) {
        if (data.code === "PRO_REQUIRED") {
          toast.error("AI templates require Pro");
        } else {
          toast.error(data.error ?? "Couldn't generate template");
        }
        return;
      }

      if (!data.draft) {
        toast.error("Couldn't generate template");
        return;
      }

      onApply(data.draft);
      setOpen(false);
      setPrompt("");
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
      toast.error("Couldn't generate template");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={entitlementLoading}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" />
        {mode === "edit" ? "Edit with AI" : "Describe with AI"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit"
                ? "Edit template with AI"
                : "Describe your workout"}
            </DialogTitle>
            <DialogDescription>
              {isPro
                ? mode === "edit"
                  ? "Say what to change. We'll update the draft in the editor — nothing is saved until you hit Save."
                  : "Describe the session in plain language. We'll fill the editor — nothing is saved until you hit Save."
                : "AI template generation is a Pro feature."}
            </DialogDescription>
          </DialogHeader>

          {isPro ? (
            <div className="grid gap-2">
              <Label htmlFor="ai-template-prompt">Description</Label>
              <Textarea
                id="ai-template-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === "edit"
                    ? "e.g. Swap bench for dumbbell press and add lateral raises"
                    : "e.g. Push day: bench, OHP, dips, lateral raises — 4 sets of 8–10"
                }
                rows={5}
                disabled={generating}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Upgrade to Pro to generate or edit templates from a description.
              {entitlement?.allowManualPro ? (
                <>
                  {" "}
                  For testing before billing ships, enable Pro under{" "}
                  <Link href="/settings" className="text-foreground underline">
                    Settings
                  </Link>
                  .
                </>
              ) : null}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            {isPro ? (
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
              >
                <Sparkles className="size-4" />
                {generating ? "Generating…" : "Generate"}
              </Button>
            ) : (
              <Button type="button" asChild>
                <Link href="/settings">Go to Settings</Link>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
