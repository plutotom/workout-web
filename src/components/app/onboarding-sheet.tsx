"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { Dumbbell, Zap } from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useVisualViewportFrame } from "@/hooks/use-visual-viewport-frame";
import { cn } from "@/lib/utils";

/**
 * First-run sheet: Quick start a blank workout, or build a template for later.
 * Existing accounts are grandfathered in bootstrap so this only opens for
 * brand-new signups (and until they pick a path or skip).
 */
export function OnboardingSheet() {
  const router = useRouter();
  const user = useQuery(api.routes.auth.users.current);
  const completeOnboarding = useMutation(
    api.routes.auth.users.completeOnboarding,
  );
  const startBlank = useMutation(api.routes.workouts.mutations.startBlank);

  // Capture once so render stays pure (eslint react-hooks/purity).
  const [openedAt] = useState(() => Date.now());
  const needsOnboarding =
    user !== undefined &&
    user !== null &&
    user.onboardingCompletedAt === undefined &&
    // Existing accounts are grandfathered on bootstrap, but `current` can
    // resolve first — only brand-new signups should see the sheet.
    openedAt - user.createdAt < 60 * 60 * 1000;

  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const { style: viewportStyle } = useVisualViewportFrame(needsOnboarding, {
    mode: "dock",
  });

  const show = needsOnboarding && open;

  async function finishOnboarding() {
    await completeOnboarding({});
  }

  async function handleOpenChange(next: boolean) {
    if (next || busy) {
      setOpen(next);
      return;
    }
    setBusy(true);
    try {
      await finishOnboarding();
      setOpen(false);
    } catch {
      toast.error("Couldn't save onboarding");
      setBusy(false);
    }
  }

  async function handleQuickStart() {
    setBusy(true);
    try {
      await finishOnboarding();
      const sessionId = await startBlank({});
      setOpen(false);
      router.push(`/workout/${sessionId}`);
    } catch {
      toast.error("Couldn't start workout");
      setBusy(false);
    }
  }

  async function handleNewTemplate() {
    setBusy(true);
    try {
      await finishOnboarding();
      setOpen(false);
      router.push("/templates/new");
    } catch {
      toast.error("Couldn't continue");
      setBusy(false);
    }
  }

  if (!needsOnboarding) return null;

  return (
    <Sheet open={show} onOpenChange={(next) => void handleOpenChange(next)}>
      <SheetContent
        side="bottom"
        style={viewportStyle}
        className={cn(
          "flex flex-col gap-0 overflow-hidden rounded-t-2xl border-t p-0",
          !viewportStyle && "max-h-[min(100dvh,34rem)]",
        )}
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="bg-muted-foreground/30 h-1 w-10 rounded-full" />
        </div>

        <SheetHeader className="shrink-0 gap-1.5 px-4 pt-2 pr-12 text-left">
          <SheetTitle className="text-xl">Start training</SheetTitle>
          <SheetDescription>
            Quick start a workout now, or build a template for next time.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="grid gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleQuickStart()}
              className="border-border bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] flex min-h-14 w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-all disabled:opacity-50"
            >
              <span className="bg-primary-foreground/15 mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Zap className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold">
                  Quick start
                </span>
                <span className="text-primary-foreground/70 mt-0.5 block text-sm leading-snug">
                  Jump in empty and add exercises as you lift.
                </span>
              </span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleNewTemplate()}
              className="border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98] flex min-h-14 w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all disabled:opacity-50"
            >
              <span className="bg-muted mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Dumbbell className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold">
                  New template
                </span>
                <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">
                  Build a reusable plan, then start it when you&apos;re ready.
                </span>
              </span>
            </button>
          </div>
        </div>

        <SheetFooter className="shrink-0 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => void handleOpenChange(false)}
          >
            Skip for now
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
