/**
 * Per-session exercise collapse for the live List workout.
 *
 * This is UI chrome, not workout data: it never goes through Convex or the
 * iOS outbox. The store is keyed by session id so leaving the log (Settings,
 * Focus, a kill + relaunch) can restore the same open/closed cards. A missing
 * exercise id means expanded — that's the default for a new workout.
 *
 * Replace keeps the session-exercise id (same slot), so that card's collapse
 * survives automatically. Delete drops the id from the live list; prune
 * removes its entry. Finish / discard / delete-session clear the session key.
 */

export const WORKOUT_COLLAPSE_STORAGE_KEY = "workout:session-collapse";

export type CollapsedMap = Record<string, true>;
export type CollapseStore = Record<string, CollapsedMap>;

export type WorkoutCollapseStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const EMPTY_COLLAPSED: CollapsedMap = Object.freeze({});
const listeners = new Set<() => void>();

let storage: WorkoutCollapseStorage | null = detectWebStorage();
let store: CollapseStore = storage
  ? parseCollapseStore(storage.getItem(WORKOUT_COLLAPSE_STORAGE_KEY))
  : {};
let dirty = false;
let hydrated = storage !== null;

function detectWebStorage(): WorkoutCollapseStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  if (!storage) return;
  if (Object.keys(store).length === 0) {
    storage.removeItem(WORKOUT_COLLAPSE_STORAGE_KEY);
    return;
  }
  storage.setItem(WORKOUT_COLLAPSE_STORAGE_KEY, serializeCollapseStore(store));
}

function commit(sessionId: string, collapsed: CollapsedMap): CollapsedMap {
  const next: CollapseStore = { ...store };
  if (Object.keys(collapsed).length === 0) delete next[sessionId];
  else next[sessionId] = collapsed;
  store = next;
  dirty = true;
  persist();
  emit();
  return store[sessionId] ?? EMPTY_COLLAPSED;
}

export function parseCollapseStore(
  raw: string | null | undefined,
): CollapseStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const next: CollapseStore = {};
    for (const [sessionId, value] of Object.entries(parsed)) {
      if (
        !sessionId ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        continue;
      }
      const collapsed: CollapsedMap = {};
      for (const [exerciseId, flag] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (exerciseId && flag === true) collapsed[exerciseId] = true;
      }
      if (Object.keys(collapsed).length > 0) next[sessionId] = collapsed;
    }
    return next;
  } catch {
    return {};
  }
}

export function serializeCollapseStore(value: CollapseStore): string {
  return JSON.stringify(value);
}

export function toggleCollapsed(
  current: CollapsedMap,
  exerciseId: string,
): CollapsedMap {
  const next = { ...current };
  if (next[exerciseId]) delete next[exerciseId];
  else next[exerciseId] = true;
  return next;
}

export function expandCollapsed(
  current: CollapsedMap,
  exerciseId: string,
): CollapsedMap {
  if (!current[exerciseId]) return current;
  const next = { ...current };
  delete next[exerciseId];
  return next;
}

export function pruneCollapsed(
  current: CollapsedMap,
  liveExerciseIds: readonly string[],
): CollapsedMap {
  const live = new Set(liveExerciseIds.filter(Boolean));
  let changed = false;
  const next: CollapsedMap = {};
  for (const id of Object.keys(current)) {
    if (!live.has(id)) {
      changed = true;
      continue;
    }
    next[id] = true;
  }
  return changed ? next : current;
}

/**
 * Replace keeps the slot id on current builds. If a future swap issues a new
 * id, copy the old card's collapse onto the new one.
 */
export function retainCollapsedAcrossReplace(
  current: CollapsedMap,
  fromId: string,
  toId: string,
): CollapsedMap {
  if (!fromId || !toId || fromId === toId) return current;
  const wasCollapsed = Boolean(current[fromId]);
  if (!current[fromId] && !current[toId]) return current;
  const next = { ...current };
  delete next[fromId];
  if (wasCollapsed) next[toId] = true;
  else delete next[toId];
  return next;
}

export function subscribeWorkoutCollapse(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isWorkoutCollapseHydrated(): boolean {
  return hydrated;
}

export function readSessionCollapsed(sessionId: string): CollapsedMap {
  if (!sessionId) return EMPTY_COLLAPSED;
  return store[sessionId] ?? EMPTY_COLLAPSED;
}

export function writeSessionCollapsed(
  sessionId: string,
  collapsed: CollapsedMap,
): CollapsedMap {
  if (!sessionId) return EMPTY_COLLAPSED;
  return commit(sessionId, collapsed);
}

export function toggleSessionCollapsed(
  sessionId: string,
  exerciseId: string,
): CollapsedMap {
  if (!sessionId || !exerciseId) return readSessionCollapsed(sessionId);
  return commit(
    sessionId,
    toggleCollapsed(readSessionCollapsed(sessionId), exerciseId),
  );
}

export function expandSessionCollapsed(
  sessionId: string,
  exerciseId: string,
): CollapsedMap {
  if (!sessionId || !exerciseId) return readSessionCollapsed(sessionId);
  const current = readSessionCollapsed(sessionId);
  const next = expandCollapsed(current, exerciseId);
  if (next === current) return current;
  return commit(sessionId, next);
}

export function pruneSessionCollapsed(
  sessionId: string,
  liveExerciseIds: readonly string[],
): CollapsedMap {
  if (!sessionId) return EMPTY_COLLAPSED;
  const current = readSessionCollapsed(sessionId);
  const next = pruneCollapsed(current, liveExerciseIds);
  if (next === current) return current;
  return commit(sessionId, next);
}

export function retainSessionCollapsedAcrossReplace(
  sessionId: string,
  fromId: string,
  toId: string,
): CollapsedMap {
  if (!sessionId) return EMPTY_COLLAPSED;
  const current = readSessionCollapsed(sessionId);
  const next = retainCollapsedAcrossReplace(current, fromId, toId);
  if (next === current) return current;
  return commit(sessionId, next);
}

export function clearSessionCollapsed(sessionId: string): void {
  if (!sessionId || !store[sessionId]) {
    hydrated = true;
    return;
  }
  commit(sessionId, EMPTY_COLLAPSED);
}

export function configureWorkoutCollapseStorage(
  next: WorkoutCollapseStorage | null,
): void {
  storage = next;
}

/**
 * Load a persisted snapshot after process start. In-process edits win if the
 * user already toggled a card before the file/localStorage read finished.
 */
export function seedWorkoutCollapseStore(raw: string | null | undefined): void {
  if (dirty) {
    hydrated = true;
    persist();
    emit();
    return;
  }
  store = parseCollapseStore(raw);
  hydrated = true;
  emit();
}

export function resetWorkoutCollapseStoreForTests(
  nextStorage: WorkoutCollapseStorage | null = null,
): void {
  storage = nextStorage;
  store = nextStorage
    ? parseCollapseStore(nextStorage.getItem(WORKOUT_COLLAPSE_STORAGE_KEY))
    : {};
  dirty = false;
  hydrated = true;
  emit();
}
