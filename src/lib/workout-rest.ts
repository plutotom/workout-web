"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Client-local rest timer shared by the List (sticky bar) and Focus (ring)
 * active-workout views. State resets on remount by design — switching views
 * mid-workout drops the running timer, which is acceptable.
 */
export type RestState = {
  startedAt: number;
  seconds: number;
  label: string;
};

export function restRemaining(rest: RestState | null, now: number): number {
  if (!rest) return 0;
  return Math.max(0, rest.seconds - Math.floor((now - rest.startedAt) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Rest state machine. `onEnd` fires only when the timer runs out naturally —
 * Skip (`clearRest`) is silent so callers decide what a skip means.
 */
export function useWorkoutRest(onEnd?: () => void) {
  const [rest, setRest] = useState<RestState | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    if (!rest) return;
    const remaining = restRemaining(rest, Date.now());
    const id = window.setTimeout(() => {
      setRest(null);
      onEndRef.current?.();
    }, remaining * 1000);
    return () => window.clearTimeout(id);
  }, [rest]);

  const startRest = useCallback((seconds: number, label: string) => {
    setRest({ startedAt: Date.now(), seconds, label });
  }, []);

  const clearRest = useCallback(() => setRest(null), []);

  const addSeconds = useCallback((extra: number) => {
    setRest((prev) =>
      prev ? { ...prev, seconds: prev.seconds + extra } : prev,
    );
  }, []);

  return { rest, startRest, clearRest, addSeconds };
}

/**
 * Human label for what comes after completing set `setIndex` of `exerciseId`:
 * the next set of the same exercise, the first incomplete set of a later
 * exercise, or the finish line.
 */
export function nextSetLabel(
  exercises: { _id: string; sets: { completed: boolean }[] }[],
  exerciseId: string,
  setIndex: number,
): string {
  const exIndex = exercises.findIndex((e) => e._id === exerciseId);
  if (exIndex < 0) return "keep moving";

  const sameExerciseNext = exercises[exIndex].sets[setIndex + 1];
  if (sameExerciseNext && !sameExerciseNext.completed) {
    return `set ${setIndex + 2}`;
  }

  for (let i = exIndex + 1; i < exercises.length; i++) {
    const next = exercises[i].sets.findIndex((set) => !set.completed);
    if (next >= 0) return `next exercise · set ${next + 1}`;
  }

  return "finish workout";
}
