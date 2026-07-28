"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  Check,
  ChevronLeft,
  ClipboardList,
  Dumbbell,
  Pencil,
  Play,
  Zap,
} from "lucide-react";
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

type OnboardingGoal = "strength" | "maintain" | "habit";
type OnboardingSetting = "commercial-gym" | "home-gym" | "bodyweight";
type OnboardingStep = "goal" | "setting" | "tour" | "finish";

const goalOptions: {
  value: OnboardingGoal;
  title: string;
  description: string;
}[] = [
  {
    value: "strength",
    title: "Build strength",
    description: "Get stronger and make measurable progress.",
  },
  {
    value: "maintain",
    title: "Maintain fitness",
    description: "Keep moving and maintain the fitness you have.",
  },
  {
    value: "habit",
    title: "Build a workout habit",
    description: "Make showing up feel simple and repeatable.",
  },
];

const settingOptions: {
  value: OnboardingSetting;
  title: string;
  description: string;
}[] = [
  {
    value: "commercial-gym",
    title: "Commercial gym",
    description: "Use barbells, machines, cables, and more.",
  },
  {
    value: "home-gym",
    title: "Home gym",
    description: "Use the equipment you keep at home.",
  },
  {
    value: "bodyweight",
    title: "Bodyweight / no equipment",
    description: "Train with movements that need little or no equipment.",
  },
];

const tutorialItems = [
  {
    icon: ClipboardList,
    title: "Templates",
    description: "Your reusable workout plans live here.",
  },
  {
    icon: Play,
    title: "Start a workout",
    description: "Open a template and tap Start workout to begin.",
  },
  {
    icon: Check,
    title: "Log your sets",
    description: "Record the weight and reps you complete as you lift.",
  },
  {
    icon: Pencil,
    title: "Edit later",
    description: "Change exercises, sets, and names whenever you want.",
  },
];

/**
 * First-run sheet: a two-question setup, short app orientation, and a choice
 * of where to go next. Closing the sheet still skips and completes onboarding.
 */
export function OnboardingSheet() {
  const router = useRouter();
  const user = useQuery(api.routes.auth.users.current);
  const completeOnboarding = useMutation(
    api.routes.auth.users.completeOnboarding,
  );
  const setupStarterTemplates = useMutation(
    api.routes.templates.mutations.setupStarterTemplates,
  );
  const startBlank = useMutation(api.routes.workouts.mutations.startBlank);

  // Missing completedAt, or the old auto-stamp that equaled createdAt.
  const needsOnboarding =
    user !== undefined &&
    user !== null &&
    (user.onboardingCompletedAt === undefined ||
      user.onboardingCompletedAt === user.createdAt);

  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<OnboardingStep>("goal");
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [setting, setSetting] = useState<OnboardingSetting | null>(null);
  const [busy, setBusy] = useState(false);
  const { style: viewportStyle } = useVisualViewportFrame(needsOnboarding, {
    mode: "dock",
  });

  const show = needsOnboarding && open;

  async function finishOnboarding() {
    await completeOnboarding({});
  }

  async function handleSkip() {
    if (busy) return;
    setBusy(true);
    try {
      await finishOnboarding();
      setOpen(false);
    } catch {
      toast.error("Couldn't save onboarding");
      setBusy(false);
    }
  }

  async function handleOpenChange(next: boolean) {
    if (next) {
      setOpen(true);
      return;
    }
    if (!busy) void handleSkip();
  }

  async function handleCreateTemplates() {
    if (!goal || !setting || busy) return;
    setBusy(true);
    try {
      await setupStarterTemplates({ goal, setting });
      setStep("tour");
    } catch {
      toast.error("Couldn't prepare your starter templates");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalChoice(choice: "templates" | "new" | "empty") {
    if (busy) return;
    setBusy(true);
    try {
      await finishOnboarding();

      if (choice === "empty") {
        const sessionId = await startBlank({});
        setOpen(false);
        router.push(`/workout/${sessionId}`);
        return;
      }

      setOpen(false);
      router.push(choice === "templates" ? "/templates" : "/templates/new");
    } catch {
      toast.error(
        choice === "empty"
          ? "Couldn't start workout"
          : "Couldn't finish onboarding",
      );
      setBusy(false);
    }
  }

  if (!needsOnboarding) return null;

  const title =
    step === "goal"
      ? "Make it yours"
      : step === "setting"
        ? "Where do you train?"
        : step === "tour"
          ? "A quick tour"
          : "You’re ready to train";
  const description =
    step === "goal"
      ? "Choose a general direction and we’ll set up a simple starting point."
      : step === "setting"
        ? "We’ll use this to choose exercises for your starter templates."
        : step === "tour"
          ? "Here’s the basic rhythm of the app."
          : "Your starter templates are ready. Choose what you want to do next.";

  return (
    <Sheet open={show} onOpenChange={(next) => void handleOpenChange(next)}>
      <SheetContent
        side="bottom"
        style={viewportStyle}
        className={cn(
          "flex flex-col gap-0 overflow-hidden rounded-t-2xl border-t p-0",
          !viewportStyle && "max-h-[min(100dvh,42rem)]",
        )}
      >
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="bg-muted-foreground/30 h-1 w-10 rounded-full" />
        </div>

        <SheetHeader className="shrink-0 gap-1.5 px-4 pt-2 pr-12 text-left">
          <SheetTitle className="text-xl">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {step === "goal" ? (
            <div className="grid gap-3" role="radiogroup" aria-label="Goal">
              {goalOptions.map((option) => {
                const selected = goal === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => setGoal(option.value)}
                    className={cn(
                      "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98] flex min-h-16 w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all disabled:opacity-50",
                      selected && "border-primary bg-primary/10",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/50",
                      )}
                    >
                      {selected ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold">
                        {option.title}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === "setting" ? (
            <div
              className="grid gap-3"
              role="radiogroup"
              aria-label="Training setting"
            >
              {settingOptions.map((option) => {
                const selected = setting === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => setSetting(option.value)}
                    className={cn(
                      "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98] flex min-h-16 w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all disabled:opacity-50",
                      selected && "border-primary bg-primary/10",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/50",
                      )}
                    >
                      {selected ? <Check className="size-3.5" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold">
                        {option.title}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === "tour" ? (
            <div className="grid gap-2">
              {tutorialItems.map(
                ({
                  icon: Icon,
                  title: itemTitle,
                  description: itemDescription,
                }) => (
                  <div
                    key={itemTitle}
                    className="bg-secondary flex items-start gap-3 rounded-xl px-4 py-3.5"
                  >
                    <span className="bg-muted mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold">
                        {itemTitle}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">
                        {itemDescription}
                      </span>
                    </span>
                  </div>
                ),
              )}
            </div>
          ) : null}

          {step === "finish" ? (
            <div className="grid gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinalChoice("templates")}
                className="border-border bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98] flex min-h-14 w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left transition-all disabled:opacity-50"
              >
                <span className="bg-primary-foreground/15 mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Dumbbell className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold">
                    View my templates
                  </span>
                  <span className="text-primary-foreground/70 mt-0.5 block text-sm leading-snug">
                    See the three starter workouts we created for you.
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinalChoice("new")}
                className="border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98] flex min-h-14 w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all disabled:opacity-50"
              >
                <span className="bg-muted mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Pencil className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold">
                    Create a new template
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">
                    Build your own reusable workout from scratch.
                  </span>
                </span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinalChoice("empty")}
                className="border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98] flex min-h-14 w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all disabled:opacity-50"
              >
                <span className="bg-muted mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg">
                  <Zap className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-semibold">
                    Start an empty workout
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">
                    Log a workout now and add exercises as you go.
                  </span>
                </span>
              </button>
            </div>
          ) : null}
        </div>

        <SheetFooter className="shrink-0 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {step === "goal" ? (
            <div className="grid w-full gap-2">
              <Button
                type="button"
                className="w-full"
                disabled={!goal || busy}
                onClick={() => setStep("setting")}
              >
                Continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => void handleSkip()}
              >
                Skip for now
              </Button>
            </div>
          ) : null}

          {step === "setting" ? (
            <div className="grid w-full gap-2">
              <Button
                type="button"
                className="w-full"
                disabled={!setting || busy}
                onClick={() => void handleCreateTemplates()}
              >
                {busy ? "Preparing templates…" : "Create my templates"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setStep("goal")}
                >
                  <ChevronLeft className="size-4" />
                  Back
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void handleSkip()}
                >
                  Skip for now
                </Button>
              </div>
            </div>
          ) : null}

          {step === "tour" ? (
            <div className="grid w-full gap-2">
              <Button
                type="button"
                className="w-full"
                onClick={() => setStep("finish")}
              >
                Continue
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep("finish")}
              >
                Skip tour
              </Button>
            </div>
          ) : null}

          {step === "finish" ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => void handleSkip()}
            >
              Skip onboarding
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
