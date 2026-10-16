/**
 * Lift edits (sets, exercises, order, place/machine) are allowed on the live
 * session and on finished strength workouts. Abandoned sessions, Apple Health
 * summaries, and free-text note workouts stay out — notes have their own
 * editor, and Health copies are not lift logs.
 */
export function sessionAllowsLiftEdits(session: {
  status: string;
  sessionKind?: string | null;
  inputMode?: string | null;
}): boolean {
  if (session.status !== "in_progress" && session.status !== "completed") {
    return false;
  }
  if ((session.sessionKind ?? "tracked") === "health_summary") return false;
  if ((session.inputMode ?? "list") === "note") return false;
  return true;
}

export function sessionAllowsCompletedReviewEdit(session: {
  status: string;
  sessionKind?: string | null;
  inputMode?: string | null;
}): boolean {
  return session.status === "completed" && sessionAllowsLiftEdits(session);
}

/** Monotonic client revision so a stale bootstrap/pull cannot rewind a local edit. */
export function nextClientUpdatedAt(
  current: number | null | undefined,
  now = Date.now(),
): number {
  return Math.max(now, (current ?? 0) + 1);
}

/**
 * A queued outbox snapshot always wins. Otherwise the cloud copy is adopted
 * only when its revision is strictly newer than the local row.
 */
export function shouldAdoptRemoteCompletedWorkout(opts: {
  pendingLocalWrite: boolean;
  localUpdatedAt: number;
  remoteClientUpdatedAt: number | null | undefined;
}): boolean {
  if (opts.pendingLocalWrite) return false;
  return (opts.remoteClientUpdatedAt ?? 0) > opts.localUpdatedAt;
}
