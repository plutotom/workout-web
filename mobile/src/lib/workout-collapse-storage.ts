import { File, Paths } from "expo-file-system";

import {
  WORKOUT_COLLAPSE_STORAGE_KEY,
  configureWorkoutCollapseStorage,
  seedWorkoutCollapseStore,
  type WorkoutCollapseStorage,
} from "@shared/workout-collapse";

const file = new File(Paths.document, "workout-session-collapse.json");

function readExistingFile(): string | Promise<string> | null {
  try {
    if (!file.exists) return null;
    return file.text();
  } catch {
    return null;
  }
}

const fileStorage: WorkoutCollapseStorage = {
  getItem(key) {
    if (key !== WORKOUT_COLLAPSE_STORAGE_KEY) return null;
    const raw = readExistingFile();
    return typeof raw === "string" ? raw : null;
  },
  setItem(key, value) {
    if (key !== WORKOUT_COLLAPSE_STORAGE_KEY) return;
    try {
      if (file.exists) file.delete();
      file.create();
      file.write(value);
    } catch {
      // Memory still holds the folds for this process.
    }
  },
  removeItem(key) {
    if (key !== WORKOUT_COLLAPSE_STORAGE_KEY) return;
    try {
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
  },
};

let hydratePromise: Promise<void> | null = null;

export function hydrateWorkoutCollapsePersistence(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    configureWorkoutCollapseStorage(fileStorage);
    try {
      const raw = await Promise.resolve(readExistingFile());
      seedWorkoutCollapseStore(typeof raw === "string" ? raw : null);
    } catch {
      seedWorkoutCollapseStore(null);
    }
  })();
  return hydratePromise;
}

void hydrateWorkoutCollapsePersistence();
