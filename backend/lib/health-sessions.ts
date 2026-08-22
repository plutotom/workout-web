export type SessionKind = "tracked" | "health_summary";

export function normalizeSessionKind(
  value: string | null | undefined,
): SessionKind {
  return value === "health_summary" ? "health_summary" : "tracked";
}

export function sessionCountsTowardGoals(session: {
  sessionKind?: SessionKind | null;
  countsTowardGoals?: boolean | null;
  hasLoggedWork: boolean;
}) {
  if (session.sessionKind === "health_summary") {
    return session.countsTowardGoals !== false;
  }
  return session.hasLoggedWork;
}
