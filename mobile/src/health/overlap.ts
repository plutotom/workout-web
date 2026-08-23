const START_WINDOW_MS = 10 * 60 * 1000;

export type TimeRange = {
  startedAt: number;
  completedAt: number;
};

function durationMs(range: TimeRange) {
  return Math.max(0, range.completedAt - range.startedAt);
}

function overlapMs(a: TimeRange, b: TimeRange) {
  const start = Math.max(a.startedAt, b.startedAt);
  const end = Math.min(a.completedAt, b.completedAt);
  return Math.max(0, end - start);
}

function sameLocalDay(a: number, b: number) {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * Likely overlap with a detailed in-app session on the same local day:
 * start times within 10 minutes, or overlap covers at least half of the
 * shorter session. Never auto-merge — this only flags Review.
 */
export function isLikelyHealthOverlap(health: TimeRange, session: TimeRange) {
  if (!sameLocalDay(health.startedAt, session.startedAt)) return false;
  if (Math.abs(health.startedAt - session.startedAt) <= START_WINDOW_MS) {
    return true;
  }
  const shorter = Math.min(durationMs(health), durationMs(session));
  if (shorter <= 0) return false;
  return overlapMs(health, session) >= shorter / 2;
}

export function findLikelyHealthOverlap<T extends TimeRange>(
  health: TimeRange,
  sessions: T[],
): T | null {
  return (
    sessions.find((session) => isLikelyHealthOverlap(health, session)) ?? null
  );
}
