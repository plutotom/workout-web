"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  Activity,
  ArrowLeft,
  Building2,
  CalendarCheck,
  Check,
  Dumbbell,
  House,
  Pencil,
  PersonStanding,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@backend/api";
import { GeneratingLoader } from "@/components/app/generating-loader";
import { OnboardingTour } from "@/components/app/onboarding-tour";
import { Button } from "@/components/ui/button";
import { useVisualViewportFrame } from "@/hooks/use-visual-viewport-frame";
import { cn } from "@/lib/utils";

type OnboardingGoal = "strength" | "maintain" | "habit";
type OnboardingSetting = "commercial-gym" | "home-gym" | "bodyweight";
type OnboardingStep =
  | "welcome"
  | "goal"
  | "setting"
  | "building"
  | "tour"
  | "finish";

/** Steps that show the progress bar, in order. */
const progressSteps: OnboardingStep[] = ["goal", "setting", "tour"];

/** Loader indices from generating-loader's pool, pinned per screen. */
const WELCOME_LOADER = 0; // Loading the Bar
const BUILDING_LOADER = 1; // The Lifter
const FINISH_LOADER = 4; // Chunk press

/**
 * The setup mutation usually returns in well under a second. Cutting the
 * animation off that fast reads as a flicker, not as work — so the build
 * screen holds for at least this long.
 */
const BUILD_MIN_MS = 2400;

/** Rotated on the build screen so the wait has something to read. */
const buildingLines = [
  "Picking movements for your setup…",
  "Balancing push, pull, and legs…",
  "Setting your starting sets and reps…",
  "Almost there…",
];

const goalOptions: {
  value: OnboardingGoal;
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    value: "strength",
    icon: TrendingUp,
    title: "Build strength",
    description: "Get stronger and make measurable progress.",
  },
  {
    value: "maintain",
    icon: Activity,
    title: "Maintain fitness",
    description: "Keep moving and maintain the fitness you have.",
  },
  {
    value: "habit",
    icon: CalendarCheck,
    title: "Build a workout habit",
    description: "Make showing up feel simple and repeatable.",
  },
];

const settingOptions: {
  value: OnboardingSetting;
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    value: "commercial-gym",
    icon: Building2,
    title: "Commercial gym",
    description: "Use barbells, machines, cables, and more.",
  },
  {
    value: "home-gym",
    icon: House,
    title: "Home gym",
    description: "Use the equipment you keep at home.",
  },
  {
    value: "bodyweight",
    icon: PersonStanding,
    title: "Bodyweight / no equipment",
    description: "Train with movements that need little or no equipment.",
  },
];

const copy: Record<OnboardingStep, { title: string; description: string }> = {
  welcome: {
    title: "Let’s get you lifting.",
    description:
      "Two quick questions and you’ll have a plan ready to run today.",
  },
  goal: {
    title: "What are you training for?",
    description: "Pick the direction that fits right now — change it any time.",
  },
  setting: {
    title: "Where do you train?",
    description:
      "We’ll choose exercises that match the equipment you actually have.",
  },
  building: {
    title: "Building your starter plan",
    description: "Hang tight — this only happens once.",
  },
  tour: {
    title: "How it works",
    description: "Four things, and you know the whole app.",
  },
  finish: {
    title: "You’re all set.",
    description:
      "Three starter templates are waiting. Where do you want to go?",
  },
};

/**
 * First-run experience: a full-screen takeover rather than a sheet, so the
 * setup reads as its own moment instead of a dismissible card over the app.
 * Escaping out still skips and completes onboarding.
 */
export function OnboardingFlow() {
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
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [setting, setSetting] = useState<OnboardingSetting | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildingLine, setBuildingLine] = useState(0);
  const { style: viewportStyle } = useVisualViewportFrame(needsOnboarding, {
    mode: "fill",
  });

  const show = needsOnboarding && open;
  const progressIndex = progressSteps.indexOf(step);

  useEffect(() => {
    if (step !== "building") return;
    const id = setInterval(() => {
      setBuildingLine((current) =>
        Math.min(current + 1, buildingLines.length - 1),
      );
    }, BUILD_MIN_MS / buildingLines.length);
    return () => clearInterval(id);
  }, [step]);

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
    // Mid-build there is nothing to dismiss to — the mutation owns the screen.
    if (!busy) void handleSkip();
  }

  async function handleCreateTemplates() {
    if (!goal || !setting || busy) return;
    setBusy(true);
    setBuildingLine(0);
    setStep("building");
    const floor = new Promise((resolve) => setTimeout(resolve, BUILD_MIN_MS));
    try {
      await Promise.all([setupStarterTemplates({ goal, setting }), floor]);
      setStep("tour");
    } catch {
      toast.error("Couldn't prepare your starter templates");
      setStep("setting");
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

  const back =
    step === "goal" ? "welcome" : step === "setting" ? "goal" : undefined;
  const canSkip = step !== "building" && step !== "welcome";

  return (
    <DialogPrimitive.Root
      open={show}
      onOpenChange={(next) => void handleOpenChange(next)}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black" />
        <DialogPrimitive.Content
          style={viewportStyle}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          className={cn(
            "bg-background text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom fixed inset-x-0 z-50 flex flex-col overflow-hidden duration-400",
            !viewportStyle && "inset-y-0 h-[100dvh]",
          )}
        >
          {/* Ambient light so a full black screen still feels inhabited. */}
          <div
            aria-hidden
            className="ob-glow pointer-events-none absolute -top-1/4 left-1/2 size-[140vw] max-w-[42rem] -translate-x-1/2 rounded-full"
          />

          <header className="relative z-10 flex shrink-0 items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
            {back ? (
              <button
                type="button"
                aria-label="Back"
                disabled={busy}
                onClick={() => setStep(back)}
                className="text-muted-foreground hover:text-foreground -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="size-5" />
              </button>
            ) : (
              <span className="size-9 shrink-0" />
            )}

            <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
              {progressIndex >= 0
                ? progressSteps.map((name, index) => (
                    <span
                      key={name}
                      className={cn(
                        "h-1 w-8 rounded-full transition-colors duration-300",
                        index <= progressIndex
                          ? "bg-foreground"
                          : "bg-muted-foreground/25",
                      )}
                    />
                  ))
                : null}
            </div>

            {canSkip ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSkip()}
                className="text-muted-foreground hover:text-foreground -mr-2 shrink-0 rounded-full px-2 py-1 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Skip
              </button>
            ) : (
              <span className="size-9 shrink-0" />
            )}
          </header>

          <div
            key={step}
            className="ob-step relative z-10 flex min-h-0 flex-1 flex-col"
          >
            {step === "tour" ? (
              <>
                {/* The pager owns the visible headings, so Radix's required
                    labels are announced-only here. */}
                <DialogPrimitive.Title className="sr-only">
                  {copy.tour.title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  {copy.tour.description}
                </DialogPrimitive.Description>
                <OnboardingTour onDone={() => setStep("finish")} />
              </>
            ) : (
              <>
                <div
                  className={cn(
                    "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-4",
                    // The hero screens are a loader plus two lines, so
                    // top-aligning them strands half a screen of black above
                    // the button. `safe` keeps the top reachable if the
                    // content ever outgrows a short viewport; the option
                    // lists can run long, so they stay top-aligned.
                    step !== "goal" &&
                      step !== "setting" &&
                      "[justify-content:safe_center]",
                  )}
                >
                  {step === "welcome" || step === "building" ? (
                    <GeneratingLoader
                      size="lg"
                      forceIndex={
                        step === "welcome" ? WELCOME_LOADER : BUILDING_LOADER
                      }
                    />
                  ) : null}

                  {step === "finish" ? (
                    <GeneratingLoader size="sm" forceIndex={FINISH_LOADER} />
                  ) : null}

                  <div
                    className={cn(
                      "pb-6",
                      step === "welcome" || step === "building"
                        ? "pt-2 text-center"
                        : "pt-1",
                    )}
                  >
                    <DialogPrimitive.Title
                      className={cn(
                        "text-balance font-semibold tracking-tight",
                        step === "welcome"
                          ? "text-[2rem] leading-[1.15]"
                          : "text-2xl leading-tight",
                      )}
                    >
                      {copy[step].title}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description
                      className="text-muted-foreground mt-2 text-pretty text-[0.95rem] leading-snug"
                      aria-live={step === "building" ? "polite" : undefined}
                    >
                      {step === "building"
                        ? buildingLines[buildingLine]
                        : copy[step].description}
                    </DialogPrimitive.Description>
                  </div>

                  {step === "goal" ? (
                    <div
                      className="ob-stagger grid gap-3"
                      role="radiogroup"
                      aria-label="Goal"
                    >
                      {goalOptions.map((option) => (
                        <OptionCard
                          key={option.value}
                          icon={option.icon}
                          title={option.title}
                          description={option.description}
                          selected={goal === option.value}
                          disabled={busy}
                          onSelect={() => setGoal(option.value)}
                        />
                      ))}
                    </div>
                  ) : null}

                  {step === "setting" ? (
                    <div
                      className="ob-stagger grid gap-3"
                      role="radiogroup"
                      aria-label="Training setting"
                    >
                      {settingOptions.map((option) => (
                        <OptionCard
                          key={option.value}
                          icon={option.icon}
                          title={option.title}
                          description={option.description}
                          selected={setting === option.value}
                          disabled={busy}
                          onSelect={() => setSetting(option.value)}
                        />
                      ))}
                    </div>
                  ) : null}

                  {step === "finish" ? (
                    <div className="ob-stagger grid gap-3">
                      <ChoiceCard
                        icon={Dumbbell}
                        title="View my templates"
                        description="See the three starter workouts we created for you."
                        disabled={busy}
                        primary
                        onSelect={() => void handleFinalChoice("templates")}
                      />
                      <ChoiceCard
                        icon={Pencil}
                        title="Create a new template"
                        description="Build your own reusable workout from scratch."
                        disabled={busy}
                        onSelect={() => void handleFinalChoice("new")}
                      />
                      <ChoiceCard
                        icon={Zap}
                        title="Start an empty workout"
                        description="Log a workout now and add exercises as you go."
                        disabled={busy}
                        onSelect={() => void handleFinalChoice("empty")}
                      />
                    </div>
                  ) : null}
                </div>

                {step === "building" ? null : (
                  <footer className="shrink-0 px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                    {step === "welcome" ? (
                      <div className="grid gap-2">
                        <Button
                          type="button"
                          size="lg"
                          className="h-13 w-full rounded-2xl text-base"
                          onClick={() => setStep("goal")}
                        >
                          Get started
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          disabled={busy}
                          onClick={() => void handleSkip()}
                        >
                          Skip setup
                        </Button>
                      </div>
                    ) : null}

                    {step === "goal" ? (
                      <Button
                        type="button"
                        size="lg"
                        className="h-13 w-full rounded-2xl text-base"
                        disabled={!goal || busy}
                        onClick={() => setStep("setting")}
                      >
                        Continue
                      </Button>
                    ) : null}

                    {step === "setting" ? (
                      <Button
                        type="button"
                        size="lg"
                        className="h-13 w-full rounded-2xl text-base"
                        disabled={!setting || busy}
                        onClick={() => void handleCreateTemplates()}
                      >
                        Build my plan
                      </Button>
                    ) : null}
                  </footer>
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function OptionCard({
  icon: Icon,
  title,
  description,
  selected,
  disabled,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "border-border bg-secondary/60 hover:bg-secondary flex min-h-[4.5rem] w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.98] disabled:opacity-50",
        selected && "border-foreground bg-secondary",
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
          selected ? "bg-foreground text-background" : "bg-muted",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{title}</span>
        <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">
          {description}
        </span>
      </span>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          selected
            ? "border-foreground bg-foreground text-background"
            : "border-muted-foreground/40",
        )}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </span>
    </button>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  disabled,
  primary = false,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  disabled: boolean;
  primary?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-h-[4.25rem] w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.98] disabled:opacity-50",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent"
          : "border-border bg-secondary/60 text-secondary-foreground hover:bg-secondary",
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          primary ? "bg-primary-foreground/15" : "bg-muted",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold">{title}</span>
        <span
          className={cn(
            "mt-0.5 block text-sm leading-snug",
            primary ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          {description}
        </span>
      </span>
    </button>
  );
}
