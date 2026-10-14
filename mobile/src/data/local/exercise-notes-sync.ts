/**
 * Shared per-lift notes are local-first. Bootstrap must not clobber a row
 * that is still sitting in the outbox, matching templates/custom lifts.
 */
export function shouldAdoptCloudExerciseNote(pending: boolean): boolean {
  return !pending;
}

export function resolveBootstrappedExerciseNote({
  pending,
  local,
  cloud,
}: {
  pending: boolean;
  local: string | undefined;
  cloud: string;
}): string {
  if (pending && local !== undefined) return local;
  return cloud;
}
