"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  vsPreviousEst1RM: number | null;
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
  return `${weight}×${reps}`;
}

function progressionPath(points: { est1RM: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return "M 8 92 L 292 92";

  const values = points.map((p) => p.est1RM);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  return points
    .map((point, index) => {
      const x = 8 + (index / (points.length - 1)) * 284;
      const y = 92 - ((point.est1RM - min) / range) * 72;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function WeekGrid({ count, goal }: { count: number; goal: number }) {
  return (
    <div className="mt-8 grid grid-cols-7 gap-2">
      {Array.from({ length: 7 }, (_, index) => (
        <span
          key={index}
          className={cn(
            "grid aspect-square place-items-center rounded-md border text-xs font-semibold",
            index < count
              ? "border-foreground bg-foreground text-background"
              : index < goal
                ? "border-foreground/40 bg-foreground/5"
                : "border-muted bg-muted/40 text-muted-foreground",
          )}
        >
          {index < count ? <Check className="size-4" /> : index + 1}
        </span>
      ))}
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

  const delta = story.vsPreviousEst1RM ?? 0;
  const todayLabel = formatSet(story.today.weight, story.today.reps);
  const previousLabel = story.previous
    ? formatSet(story.previous.weight, story.previous.reps)
    : null;

  if (delta > 0) {
    return {
      title: `${shortName} +${delta} lb`,
      body: previousLabel
        ? `${todayLabel} · was ${previousLabel} last time`
        : `${todayLabel} · stronger than last time`,
    };
  }
  if (delta < 0) {
    return {
      title: `${shortName} ${delta} lb`,
      body: previousLabel
        ? `${todayLabel} · was ${previousLabel} last time`
        : `${todayLabel} · down from last time`,
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
  onOpenHistory,
}: {
  story: ProgressionStory;
  templateName: string;
  onOpenHistory: () => void;
}) {
  const points = story.points;
  const path = progressionPath(points);
  const values = points.map((p) => p.est1RM);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(1, max - min);
  const delta = story.vsPreviousEst1RM;

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
            Est. {story.today?.est1RM ?? "—"} lb 1RM. Come back after your next
            session for the comparison.
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
              <p className="mt-1 text-xs text-muted-foreground">
                est. {story.today?.est1RM ?? "—"} lb
              </p>
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
              {delta !== null ? (
                <p
                  className={cn(
                    "text-sm font-semibold",
                    delta > 0
                      ? "text-[var(--action)]"
                      : delta < 0
                        ? "text-muted-foreground"
                        : "text-foreground",
                  )}
                >
                  {delta > 0
                    ? `↑ ${delta} lb`
                    : delta < 0
                      ? `↓ ${Math.abs(delta)} lb`
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
                  className="animate-line-draw"
                />
              ) : null}
              {points.map((point, index) => {
                const x =
                  points.length === 1
                    ? 292
                    : 8 + (index / (points.length - 1)) * 284;
                const y = 92 - ((point.est1RM - min) / range) * 72;
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

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenHistory();
        }}
        className="flex w-full items-center justify-between rounded-xl border border-dashed px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-[var(--surface)]"
      >
        <span>See full history</span>
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

export function WorkoutRecap({ sessionId }: { sessionId: string }) {
  const catalog = useExerciseCatalog();
  const router = useRouter();
  const recap = useQuery(api.routes.workouts.queries.recap, {
    sessionId: sessionId as Id<"workoutSessions">,
  });
  const [step, setStep] = useState(0);

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
  const story: ProgressionStory | null = data.progressionStory ?? null;
  const progressionBeat = story
    ? progressionCopy(story, standoutShort)
    : {
        title: `${standoutShort} trend`,
        body: "Check off sets during a workout to build your trend.",
      };

  const beats = [
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
        ? `${data.standout.weight} lb × ${data.standout.reps} · est. ${data.standout.est1RM} lb 1RM`
        : "Check off sets during a workout to build records.",
      extra: data.standout ? (
        <div className="mt-8 rounded-xl border bg-[var(--surface)] p-4">
          <div className="flex items-center gap-3">
            {data.standout.isPr ? (
              <Trophy className="size-7" />
            ) : (
              <Award className="size-7" />
            )}
            <div>
              <p className="font-semibold">
                {data.standout.isPr ? "New best" : "Top set today"}
              </p>
              <p className="text-sm text-muted-foreground">
                Previous best{" "}
                {data.standout.priorBest
                  ? `${data.standout.priorBest} lb`
                  : "not set"}
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
    {
      kicker: "Progression",
      title: progressionBeat.title,
      body: progressionBeat.body,
      extra: story ? (
        <ProgressionStoryCard
          story={story}
          templateName={data.session.templateName}
          onOpenHistory={() => router.push(`/insights/exercise/${story.slug}`)}
        />
      ) : null,
    },
    {
      kicker: "Consistency",
      title: `${data.consistency.sessionsThisWeek}/${data.consistency.weeklyGoal} this week`,
      body: `${data.consistency.weekStreak} week streak`,
      extra: (
        <WeekGrid
          count={data.consistency.sessionsThisWeek}
          goal={data.consistency.weeklyGoal}
        />
      ),
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
  const beat = beats[step];

  async function share() {
    const text = `${data.session.templateName}: ${formatLb(data.totals.volume)}, ${data.totals.completedSets} sets`;
    if (navigator.share) {
      await navigator.share({ title: "Workout recap", text });
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col">
      <div className="mb-6 grid grid-cols-7 gap-1">
        {beats.map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 rounded-full transition-colors",
              i <= step ? "bg-foreground" : "bg-muted",
            )}
          />
        ))}
      </div>

      <button
        type="button"
        className="grid flex-1 place-items-center text-left"
        onClick={(event) => {
          const x = event.clientX;
          if (x < window.innerWidth * 0.35) setStep((v) => Math.max(0, v - 1));
          else setStep((v) => Math.min(beats.length - 1, v + 1));
        }}
      >
        <div key={step} className="w-full animate-rise-in">
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
      </button>

      <div className="grid gap-2 pt-6">
        {step === beats.length - 1 ? (
          <Button type="button" onClick={() => void share()}>
            <Share2 className="size-4" />
            Share
          </Button>
        ) : null}
        <Button
          asChild
          variant={step === beats.length - 1 ? "outline" : "ghost"}
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
