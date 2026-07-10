"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";

import { api } from "@backend/api";
import { PageHeader } from "@/components/app/page-header";
import { WorkoutFocus } from "@/components/app/workout-focus";
import { WorkoutLog } from "@/components/app/workout-log";

/**
 * Renders the user's preferred active-workout view (List or Focus) for a
 * session. Waits for the profile so the wrong mode never flashes.
 */
export function WorkoutSessionView({ sessionId }: { sessionId: string }) {
  const user = useQuery(api.routes.auth.users.current);

  if (user === undefined) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Log Workout" backHref="/dashboard" />
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  const mode = user?.activeWorkoutMode ?? "list";
  return mode === "focus" ? (
    <WorkoutFocus sessionId={sessionId} />
  ) : (
    <WorkoutLog sessionId={sessionId} />
  );
}
