import {
  hasWorkoutNote,
  type SessionInputMode,
} from "../../src/lib/note-workouts";

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
  inputMode?: SessionInputMode | null;
  noteBody?: string | null;
}) {
  if (session.sessionKind === "health_summary") {
    return session.countsTowardGoals !== false;
  }
  return session.hasLoggedWork || hasWorkoutNote(session);
}
