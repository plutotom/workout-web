/** Plain note text is never trimmed, converted, or parsed while saving. */
export const MAX_WORKOUT_NOTE_LENGTH = 20_000;
export type SessionInputMode = "list" | "note";
export type NoteUnit = "lb" | "kg";

export function normalizeSessionInputMode(
  value: string | null | undefined,
): SessionInputMode {
  return value === "note" ? "note" : "list";
}

/** Attendance is based on saved text, never on interpreting the workout notation. */
export function hasWorkoutNote(session: {
  inputMode?: SessionInputMode | null;
  noteBody?: string | null;
}) {
  return session.inputMode === "note" && Boolean(session.noteBody?.trim());
}

/** Count JavaScript string length consistently in Hermes, the browser, and Convex. */
export function assertWorkoutNoteLength(noteBody: string | null | undefined) {
  if (noteBody != null && noteBody.length > MAX_WORKOUT_NOTE_LENGTH) {
    throw new Error(
      `Workout note must be at most ${MAX_WORKOUT_NOTE_LENGTH} characters`,
    );
  }
}
