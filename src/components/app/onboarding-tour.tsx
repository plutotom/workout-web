"use client";

import { useRef, useState } from "react";
import { Check, ChevronRight, Play, Plus, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The first-run tour. "Templates" and "log your sets" mean nothing to someone
 * who has never opened the app, so each page shows a small working mockup of
 * the real screen — same surfaces, same type scale, same controls — with the
 * one interaction that matters looping on it.
 *
 * Motion rules match app/loaders.css: transform/opacity only, and
 * `prefers-reduced-motion` freezes everything via the global rule.
 */

/** A slice of the app, framed so it reads as a screenshot and not as chrome. */
function SceneFrame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border/70 mx-auto w-full max-w-[17.5rem] rounded-[1.25rem] border bg-[var(--surface)] p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]">
      <p className="text-muted-foreground mb-2.5 px-0.5 text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Matches the card in templates-list.tsx: name, exercise chips, meta line. */
function TemplateCard({
  name,
  exercises,
  meta,
  className,
  children,
}: {
  name: string;
  exercises: string[];
  meta: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-border/70 rounded-xl border bg-[var(--surface-2)] p-2.5",
        className,
      )}
    >
      <p className="text-[13px] font-semibold">{name}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {exercises.map((exercise) => (
          <span
            key={exercise}
            className="text-muted-foreground rounded-full bg-[var(--bg)] px-1.5 py-0.5 text-[10px]"
          >
            {exercise}
          </span>
        ))}
      </div>
      <p className="text-muted-foreground mt-1.5 text-[10px]">{meta}</p>
      {children}
    </div>
  );
}

function TemplatesScene() {
  return (
    <SceneFrame label="Templates">
      <div className="grid gap-2">
        <TemplateCard
          className="ob-rise-1"
          name="Push Day"
          exercises={["Bench", "OHP", "Dips"]}
          meta="Last: Mar 4"
        />
        <TemplateCard
          className="ob-rise-2"
          name="Pull Day"
          exercises={["Row", "Pulldown", "Curl"]}
          meta="No sessions yet"
        />
        <TemplateCard
          className="ob-rise-3"
          name="Leg Day"
          exercises={["Squat", "RDL"]}
          meta="No sessions yet"
        />
      </div>
    </SceneFrame>
  );
}

function StartScene() {
  return (
    <SceneFrame label="Push Day">
      <TemplateCard
        name="Push Day"
        exercises={["Bench", "OHP", "Dips"]}
        meta="Last: Mar 4"
      >
        <div className="relative mt-2.5">
          <div className="ob-press bg-primary text-primary-foreground flex h-8 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium">
            <Play className="size-3" />
            Start workout
          </div>
          {/* The tap that turns a plan into a live session. */}
          <span
            aria-hidden
            className="ob-ripple bg-foreground/70 pointer-events-none absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <div className="border-border/70 text-muted-foreground flex h-7 items-center justify-center rounded-md border text-[11px]">
            Edit
          </div>
          <div className="border-border/70 text-muted-foreground flex h-7 items-center justify-center rounded-md border text-[11px]">
            History
          </div>
        </div>
      </TemplateCard>
    </SceneFrame>
  );
}

/** Mirrors the SET / WEIGHT / REPS / ✓ grid in workout-log.tsx. */
function LogScene() {
  const rows = [
    { weight: "135", reps: "8", tick: "ob-tick-1" },
    { weight: "155", reps: "6", tick: "ob-tick-2" },
    { weight: "175", reps: "5", tick: "ob-tick-3" },
  ];

  return (
    <SceneFrame label="Bench Press">
      <div className="border-border/70 rounded-xl border bg-[var(--surface-2)] p-2.5">
        <div className="text-muted-foreground grid grid-cols-[1.25rem_1fr_1fr_1.5rem] gap-1.5 px-0.5 pb-1.5 text-[10px] font-medium tracking-wide uppercase">
          <span>Set</span>
          <span>Weight</span>
          <span>Reps</span>
          <span className="text-center">✓</span>
        </div>
        <div className="grid gap-1.5">
          {rows.map((row, index) => (
            <div
              key={row.weight}
              className="grid grid-cols-[1.25rem_1fr_1fr_1.5rem] items-center gap-1.5"
            >
              <span className="text-muted-foreground text-[11px]">
                {index + 1}
              </span>
              <span className="border-input flex h-7 items-center rounded-md border bg-[var(--bg)] px-2 text-[12px] tabular-nums">
                {row.weight}
              </span>
              <span className="border-input flex h-7 items-center rounded-md border bg-[var(--bg)] px-2 text-[12px] tabular-nums">
                {row.reps}
              </span>
              <span className="border-border/70 relative flex size-6 items-center justify-center rounded-md border">
                <Check
                  className={cn("text-success ob-tick size-3.5", row.tick)}
                />
              </span>
            </div>
          ))}
        </div>
        <div className="text-muted-foreground mt-2 flex items-center gap-1 text-[11px]">
          <Plus className="size-3" />
          Add set
        </div>
      </div>
    </SceneFrame>
  );
}

/** Sets going 3 → 4 on a template, to show nothing is locked in. */
function EditScene() {
  return (
    <SceneFrame label="Edit template">
      <div className="grid gap-2">
        <div className="border-border/70 rounded-xl border bg-[var(--surface-2)] p-2.5">
          <p className="text-[13px] font-semibold">Bench Press</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground text-[11px]">Sets</span>
            <div className="flex items-center gap-1.5">
              <span className="border-border/70 text-muted-foreground flex size-6 items-center justify-center rounded-md border text-[12px]">
                −
              </span>
              <span className="relative flex h-7 w-9 items-center justify-center rounded-md bg-[var(--bg)] text-[12px] tabular-nums">
                <span className="ob-swap-out absolute">3</span>
                <span className="ob-swap-in absolute">4</span>
              </span>
              <span className="ob-press border-border/70 flex size-6 items-center justify-center rounded-md border text-[12px]">
                +
              </span>
            </div>
          </div>
        </div>

        <div className="border-border/70 rounded-xl border bg-[var(--surface-2)] p-2.5 opacity-70">
          <p className="text-[13px] font-semibold">Overhead Press</p>
          <p className="text-muted-foreground mt-1 text-[10px]">3 × 8 reps</p>
        </div>

        <div className="text-muted-foreground flex items-center gap-1 px-0.5 text-[11px]">
          <Plus className="size-3" />
          Add exercise
        </div>
      </div>
    </SceneFrame>
  );
}

const scenes = [
  {
    id: "templates",
    Scene: TemplatesScene,
    title: "Templates hold your plans",
    description:
      "A template is a saved list of exercises — “Push Day”, “Leg Day”. You start with three, built around the answers you just gave.",
  },
  {
    id: "start",
    Scene: StartScene,
    title: "Tap Start workout",
    description:
      "Opening a template and hitting Start turns the plan into a live session you can log against. No setup at the gym.",
  },
  {
    id: "log",
    Scene: LogScene,
    title: "Log each set as you lift",
    description:
      "Type the weight and reps, tap the check. That’s the whole loop — the app remembers the rest for next time.",
  },
  {
    id: "edit",
    Scene: EditScene,
    title: "Change anything, any time",
    description:
      "Add sets, swap exercises, rename a day. Nothing you pick today is locked in.",
  },
] as const;

export function OnboardingTour({ onDone }: { onDone: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const last = page === scenes.length - 1;

  function goTo(next: number) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: track.clientWidth * next, behavior: "smooth" });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={trackRef}
        onScroll={(event) => {
          const track = event.currentTarget;
          // clientWidth is the page width — the track is one page per child.
          const next = Math.round(track.scrollLeft / track.clientWidth);
          if (next !== page) setPage(next);
        }}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {scenes.map(({ id, Scene, title, description }, index) => (
          <section
            key={id}
            className="flex w-full shrink-0 snap-center flex-col justify-center gap-6 px-5 py-2"
          >
            {/* Every scene loops from mount, so a user swiping to page 3
                arrives partway through the 4.2s check sequence and never sees
                set 1 tick first. Re-keying on activation remounts the scene
                and restarts its loops from frame 0. */}
            <div key={index === page ? `${id}-active` : id}>
              <Scene />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-balance">{title}</h2>
              <p className="text-muted-foreground mx-auto mt-2 max-w-[22rem] text-[0.95rem] leading-snug text-pretty">
                {description}
              </p>
            </div>
          </section>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-2 py-3">
        {scenes.map(({ id }, index) => (
          <button
            key={id}
            type="button"
            aria-label={`Go to step ${index + 1}`}
            aria-current={index === page}
            onClick={() => goTo(index)}
            className="p-1.5"
          >
            <span
              className={cn(
                "block size-1.5 rounded-full transition-all duration-300",
                index === page ? "bg-foreground w-5" : "bg-muted-foreground/35",
              )}
            />
          </button>
        ))}
      </div>

      <footer className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          size="lg"
          className="h-13 w-full rounded-2xl text-base"
          onClick={() => (last ? onDone() : goTo(page + 1))}
        >
          {last ? (
            <>
              <Zap className="size-4" />
              Let’s go
            </>
          ) : (
            <>
              Next
              <ChevronRight className="size-4" />
            </>
          )}
        </Button>
      </footer>
    </div>
  );
}
