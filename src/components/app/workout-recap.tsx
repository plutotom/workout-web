"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { ArrowRight, Award, Check, Share2, Trophy } from "lucide-react";

import { api } from "@backend/api";
import type { Id } from "@backend/dataModel";
import { EmptyState } from "@/components/app/empty-state";
import { useExerciseCatalog } from "@/components/app/exercise-catalog-provider";
import { Button } from "@/components/ui/button";
import {
  buildMuscleSegments,
  formatDuration,
  formatLb,
  MuscleBand,
} from "@/components/app/workout-design";
import { exerciseDetailPath } from "@/lib/exercise-browser";
import { formatHealthDistance, formatHealthEnergy } from "@/lib/health-summary";
import { cn } from "@/lib/utils";

type ProgressionStoryPoint = {
  completedAt: number;
  weight: number;
  reps: number;
  est1RM: number;
  sameTemplate: boolean;
};

type ProgressionStory = {
  slug: string;
  scopedToTemplate: boolean;
  isBaseline: boolean;
  points: ProgressionStoryPoint[];
  today: { weight: number; reps: number; est1RM: number } | null;
  previous: {
    weight: number;
    reps: number;
    est1RM: number;
    completedAt: number;
  } | null;
  /** When true, lower recorded weight means "better" (assisted/counterweighted lifts). */
  isInverseWeight?: boolean;
  vsPreviousWeight: number | null;
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatShortDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatSet(weight: number, reps: number) {
  if (weight <= 0) return `${reps} reps`;
  return `${weight}×${reps}`;
}

function progressionPath(points: { weight: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return "M 8 92 L 292 92";

  const values = points.map((p) => p.weight);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  return points
    .map((point, index) => {
      const x = 8 + (index / (points.length - 1)) * 284;
      const y = 92 - ((point.weight - min) / range) * 72;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

function WeekGrid({ daysWorked }: { daysWorked: boolean[] }) {
  return (
    <div className="mt-8 grid grid-cols-7 gap-2">
      {WEEKDAY_LABELS.map((label, index) => {
        const worked = daysWorked[index] === true;
        return (
          <div key={`${label}-${index}`} className="grid gap-1.5">
            <span
              className={cn(
                "grid aspect-square place-items-center rounded-md border text-xs font-semibold",
                worked
                  ? "border-foreground bg-foreground text-background"
                  : "border-muted bg-muted/40 text-muted-foreground",
              )}
              aria-label={
                worked ? `${label}: workout logged` : `${label}: no workout`
              }
            >
              {worked ? <Check className="size-4" /> : null}
            </span>
            <span className="text-center text-[11px] font-medium text-muted-foreground">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function progressionCopy(story: ProgressionStory, shortName: string) {
  if (story.isBaseline || !story.today) {
    return {
      title: `${shortName} baseline`,
      body: "Baseline locked in — next time you'll see the trend.",
    };
  }

  const actualDelta = story.vsPreviousWeight ?? 0;
  const effectiveDelta = story.isInverseWeight ? -actualDelta : actualDelta;
  const todayLabel = formatSet(story.today.weight, story.today.reps);
  const previousLabel = story.previous
    ? formatSet(story.previous.weight, story.previous.reps)
    : null;
  const repDelta =
    story.previous != null ? story.today.reps - story.previous.reps : 0;

  if (effectiveDelta > 0) {
    return {
      title:
        actualDelta > 0
          ? `${shortName} +${actualDelta} lb`
          : `${shortName} ${actualDelta} lb`,
      body: previousLabel
        ? `${todayLabel} · was ${previousLabel} last time`
        : `${todayLabel} · stronger than last time`,
    };
  }
  if (effectiveDelta < 0) {
    return {
      title:
        actualDelta > 0
          ? `${shortName} +${actualDelta} lb`
          : `${shortName} ${actualDelta} lb`,
      body: previousLabel
        ? `${todayLabel} · was ${previousLabel} last time`
        : `${todayLabel} · down from last time`,
    };
  }
  if (repDelta > 0) {
    return {
      title: `${shortName} +${repDelta} reps`,
      body: previousLabel
        ? `${todayLabel} · was ${previousLabel} last time`
        : `${todayLabel} · more reps at the same weight`,
    };
  }
  if (repDelta < 0) {
    return {
      title: `${shortName} ${repDelta} reps`,
      body: previousLabel
        ? `${todayLabel} · was ${previousLabel} last time`
        : `${todayLabel} · fewer reps at the same weight`,
    };
  }
  return {
    title: `${shortName} holding`,
    body: previousLabel
      ? `${todayLabel} · same as last time`
      : `${todayLabel} · holding steady`,
  };
}

function ProgressionStoryCard({
  story,
  templateName,
  historyHref,
}: {
  story: ProgressionStory;
  templateName: string;
  historyHref: string;
}) {
  const points = story.points;
  const path = progressionPath(points);
  const values = points.map((p) => p.weight);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(1, max - min);
  const actualDelta = story.vsPreviousWeight;
  const effectiveDelta =
    actualDelta === null
      ? null
      : story.isInverseWeight
        ? -actualDelta
        : actualDelta;
  const repDelta =
    story.today && story.previous
      ? story.today.reps - story.previous.reps
      : null;

  return (
    <div className="mt-8 space-y-3">
      {story.isBaseline ? (
        <div className="rounded-xl border bg-[var(--surface)] p-5">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            First mark
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {story.today
              ? formatSet(story.today.weight, story.today.reps)
              : "—"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Baseline locked in. Come back after your next session for the
            comparison.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-[var(--surface)] p-4">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Today
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {story.today
                  ? formatSet(story.today.weight, story.today.reps)
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">best set</p>
            </div>
            <div className="rounded-xl border bg-[var(--surface)] p-4">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Last time
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {story.previous
                  ? formatSet(story.previous.weight, story.previous.reps)
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {story.previous
                  ? formatShortDate(story.previous.completedAt)
                  : "—"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-[var(--surface)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {story.scopedToTemplate
                  ? `${templateName} · last ${points.length}`
                  : `Last ${points.length} sessions`}
              </p>
              {effectiveDelta !== null ? (
                <p
                  className={cn(
                    "text-sm font-semibold",
                    effectiveDelta > 0 ||
                      (effectiveDelta === 0 && (repDelta ?? 0) > 0)
                      ? "text-[var(--action)]"
                      : effectiveDelta < 0 ||
                          (effectiveDelta === 0 && (repDelta ?? 0) < 0)
                        ? "text-muted-foreground"
                        : "text-foreground",
                  )}
                >
                  {effectiveDelta > 0
                    ? `↑ ${Math.abs(effectiveDelta)} lb`
                    : effectiveDelta < 0
                      ? `↓ ${Math.abs(effectiveDelta)} lb`
                      : (repDelta ?? 0) > 0
                        ? `↑ ${repDelta} reps`
                        : (repDelta ?? 0) < 0
                          ? `↓ ${Math.abs(repDelta ?? 0)} reps`
                          : "→ flat"}
                </p>
              ) : null}
            </div>
            <svg viewBox="0 0 300 110" className="h-32 w-full overflow-visible">
              <path
                d="M 8 94 L 292 94"
                stroke="var(--line)"
                strokeLinecap="round"
                strokeWidth="2"
              />
              {path ? (
                <path
                  d={path}
                  fill="none"
                  stroke="var(--action)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="5"
                  pathLength={160}
                  className="animate-line-draw"
                />
              ) : null}
              {points.map((point, index) => {
                const x =
                  points.length === 1
                    ? 292
                    : 8 + (index / (points.length - 1)) * 284;
                const y = 92 - ((point.weight - min) / range) * 72;
                const isLatest = index === points.length - 1;
                return (
                  <circle
                    key={`${point.completedAt}-${index}`}
                    cx={x}
                    cy={y}
                    r={isLatest ? 6 : 3}
                    fill="var(--action)"
                    className={isLatest ? "animate-pop" : undefined}
                  />
                );
              })}
            </svg>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>
                {points[0] ? formatShortDate(points[0].completedAt) : ""}
              </span>
              <span>Today</span>
            </div>
          </div>
        </>
      )}

      <Link
        href={historyHref}
        onClick={(event) => event.stopPropagation()}
        className="flex w-full items-center justify-between rounded-xl border border-dashed px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[var(--surface)]"
      >
        <span>See full history</span>
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

export function WorkoutRecap({
  sessionId,
  stepParam,
}: {
  sessionId: string;
  stepParam?: string;
}) {
  const catalog = useExerciseCatalog();
  const router = useRouter();
  const pathname = usePathname();
  const recap = useQuery(api.routes.workouts.queries.recap, {
    sessionId: sessionId as Id<"workoutSessions">,
  });
  const parsedStep = Number.parseInt(stepParam ?? "", 10);
  const [step, setStep] = useState(
    Number.isFinite(parsedStep) && parsedStep >= 0 ? parsedStep : 0,
  );

  useEffect(() => {
    const next = String(step);
    if (stepParam === next) return;
    router.replace(`${pathname}?step=${next}`, { scroll: false });
  }, [pathname, router, step, stepParam]);

  if (recap === undefined) {
    return <p className="text-sm text-muted-foreground">Loading recap…</p>;
  }

  if (!recap) {
    return (
      <EmptyState
        title="Workout not found"
        description="This recap is unavailable."
      />
    );
  }

  const data = recap;
  const completedAt = data.session.completedAt ?? data.session.startedAt;
  const segments = buildMuscleSegments(
    data.muscleSets.map((item) => ({
      slug: item.slug,
      sets: item.sets,
      category: catalog.category,
    })),
  );
  const standoutName = data.standout
    ? catalog.name(data.standout.slug)
    : "No completed sets";
  const standoutShort = data.standout
    ? catalog.short(data.standout.slug)
    : "Progress";
  const standoutCallout = (() => {
    if (!data.standout) return null;
    const placeLabel = data.session.placeName ? data.session.placeName : "here";
    const { isPr, priorBest, weight, reps } = data.standout;
    if (isPr) {
      return {
        title: priorBest ? "PR here" : "First logged best here",
        detail: priorBest
          ? `Beat your previous ${placeLabel} ${standoutShort} best of ${formatSet(priorBest.weight, priorBest.reps)}`
          : `First time logging ${standoutShort} ${placeLabel === "here" ? "here" : `at ${placeLabel}`} — this sets the bar`,
      };
    }
    if (!priorBest) return null;
    const matched = priorBest.weight === weight && priorBest.reps === reps;
    const underByWeight = priorBest.weight - weight;
    return {
      title: matched
        ? `Matched your ${placeLabel} best`
        : underByWeight > 0
          ? `${underByWeight} lb under your ${placeLabel} best`
          : `${priorBest.reps - reps} reps under your ${placeLabel} best`,
      detail: `Your ${placeLabel} ${standoutShort} best is ${formatSet(priorBest.weight, priorBest.reps)}`,
    };
  })();
  const story: ProgressionStory | null = data.progressionStory ?? null;
  const progressionBeat = story ? progressionCopy(story, standoutShort) : null;
  const isHealthSummary = data.session.sessionKind === "health_summary";
  const healthDistance = formatHealthDistance(data.session.distanceMeters);
  const healthEnergy = formatHealthEnergy(data.session.energyKcal);

  const liftingBeats = [
    {
      kicker: "Workout complete",
      title: data.session.templateName,
      body: formatDate(completedAt),
      extra: (
        <div className="mt-10 rounded-xl border bg-[var(--surface)] p-4">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            Banked
          </p>
          <p className="mt-2 text-5xl font-semibold">
            {data.totals.completedSets}
          </p>
          <p className="text-sm text-muted-foreground">sets completed</p>
        </div>
      ),
    },
    {
      kicker: "Volume moved",
      title: formatLb(data.totals.volume),
      body: `${formatDuration(data.totals.durationMs)} · ${data.totals.completedSets} sets · ${data.totals.exerciseCount} lifts`,
      extra: (
        <div className="mt-8 grid grid-cols-3 gap-2">
          <Stat
            label="Minutes"
            value={formatDuration(data.totals.durationMs)}
          />
          <Stat label="Sets" value={String(data.totals.completedSets)} />
          <Stat label="Lifts" value={String(data.totals.exerciseCount)} />
        </div>
      ),
    },
    {
      kicker: "Standout lift",
      title: standoutName,
      body: data.standout
        ? `Best set today: ${formatSet(data.standout.weight, data.standout.reps)}`
        : "Check off sets during a workout to build records.",
      extra:
        data.standout && standoutCallout ? (
          <div className="mt-8 rounded-xl border bg-[var(--surface)] p-4">
            <div className="flex items-center gap-3">
              {data.standout.isPr ? (
                <Trophy className="size-7 shrink-0" />
              ) : (
                <Award className="size-7 shrink-0" />
              )}
              <div>
                <p className="font-semibold">{standoutCallout.title}</p>
                <p className="text-sm text-muted-foreground">
                  {standoutCallout.detail}
                </p>
              </div>
            </div>
          </div>
        ) : null,
    },
    {
      kicker: "Where the work went",
      title: "Muscle split",
      body: "Sets by primary muscle group.",
      extra: (
        <div className="mt-8">
          <MuscleBand segments={segments} showLegend />
        </div>
      ),
    },
    ...(story && progressionBeat
      ? [
          {
            kicker: "Progression",
            title: progressionBeat.title,
            body: progressionBeat.body,
            extra: (
              <ProgressionStoryCard
                story={story}
                templateName={data.session.templateName}
                historyHref={exerciseDetailPath(story.slug, {
                  from: `/workout/${sessionId}/recap?step=${step}`,
                })}
              />
            ),
          },
        ]
      : []),
    {
      kicker: "Consistency",
      title: `${data.consistency.sessionsThisWeek}/${data.consistency.weeklyGoal} this week`,
      body: `${data.consistency.weekStreak} week streak`,
      extra: <WeekGrid daysWorked={data.consistency.daysWorked} />,
    },
    {
      kicker: "Share card",
      title: data.session.templateName,
      body: `${formatLb(data.totals.volume)} · ${data.totals.completedSets} sets · ${standoutShort}`,
      extra: (
        <div className="mt-8 rounded-2xl border bg-[var(--surface)] p-5 shadow-2xl">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {formatDate(completedAt)}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            {data.session.templateName}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="Volume" value={formatLb(data.totals.volume)} />
            <Stat label="Sets" value={String(data.totals.completedSets)} />
          </div>
          <div className="mt-5">
            <MuscleBand segments={segments} />
          </div>
        </div>
      ),
    },
  ];
  const beats = isHealthSummary
    ? [
        {
          kicker: "Imported from Health",
          title: data.session.templateName,
          body: formatDate(completedAt),
          extra: (
            <div className="mt-10 rounded-xl border bg-[var(--surface)] p-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                Duration
              </p>
              <p className="mt-2 text-5xl font-semibold">
                {formatDuration(data.totals.durationMs)}
              </p>
              <p className="text-sm text-muted-foreground">
                {data.session.sourceName
                  ? `From ${data.session.sourceName}`
                  : "Apple Health summary"}
              </p>
            </div>
          ),
        },
        {
          kicker: "Activity",
          title: data.session.templateName,
          body:
            [healthDistance, healthEnergy].filter(Boolean).join(" · ") ||
            "Summary only — no lifts, sets, or volume.",
          extra: (
            <div className="mt-8 grid grid-cols-3 gap-2">
              <Stat
                label="Minutes"
                value={formatDuration(data.totals.durationMs)}
              />
              {healthDistance ? (
                <Stat label="Distance" value={healthDistance} />
              ) : null}
              {healthEnergy ? (
                <Stat label="Energy" value={healthEnergy} />
              ) : null}
            </div>
          ),
        },
        {
          kicker: "Consistency",
          title: `${data.consistency.sessionsThisWeek}/${data.consistency.weeklyGoal} this week`,
          body: `${data.consistency.weekStreak} week streak`,
          extra: <WeekGrid daysWorked={data.consistency.daysWorked} />,
        },
      ]
    : liftingBeats;
  const safeStep = Math.min(step, beats.length - 1);
  const beat = beats[safeStep];

  async function share() {
    const text = `${data.session.templateName}: ${formatLb(data.totals.volume)}, ${data.totals.completedSets} sets`;
    if (navigator.share) {
      await navigator.share({ title: "Workout recap", text });
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col">
      <div
        className="mb-6 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${beats.length}, minmax(0, 1fr))`,
        }}
      >
        {beats.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 rounded-full transition-colors",
              i <= safeStep ? "bg-foreground" : "bg-muted",
            )}
          />
        ))}
      </div>

      <div
        className="grid flex-1 cursor-pointer place-items-center text-left"
        onClick={(event) => {
          const x = event.clientX;
          if (x < window.innerWidth * 0.35)
            setStep((v) => Math.max(0, Math.min(v, beats.length - 1) - 1));
          else
            setStep((v) =>
              Math.min(beats.length - 1, Math.min(v, beats.length - 1) + 1),
            );
        }}
      >
        <div key={safeStep} className="w-full animate-rise-in">
          <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            {beat.kicker}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {beat.title}
          </h1>
          {beat.body ? (
            <p className="mt-4 text-base text-muted-foreground">{beat.body}</p>
          ) : null}
          {beat.extra ? <div>{beat.extra}</div> : null}
        </div>
      </div>

      <div className="grid gap-2 pt-6">
        {safeStep === beats.length - 1 ? (
          <Button type="button" onClick={() => void share()}>
            <Share2 className="size-4" />
            Share
          </Button>
        ) : null}
        <Button
          asChild
          variant={safeStep === beats.length - 1 ? "outline" : "ghost"}
        >
          <Link href="/dashboard">Done</Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
