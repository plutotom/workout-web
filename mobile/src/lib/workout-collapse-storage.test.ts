import { beforeEach, expect, it, vi } from "vitest";

const disk = vi.hoisted(() => ({
  text: null as string | null,
  failWrites: false,
}));
vi.mock("expo-file-system", () => ({
  Paths: { document: "documents" },
  File: class {
    get exists() {
      return disk.text !== null;
    }
    async text() {
      return disk.text ?? "";
    }
    delete() {
      if (disk.failWrites) throw new Error("Disk unavailable");
      disk.text = null;
    }
    create() {
      if (disk.failWrites) throw new Error("Disk unavailable");
      disk.text = "";
    }
    write(value: string) {
      if (disk.failWrites) throw new Error("Disk unavailable");
      disk.text = value;
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  disk.text = null;
  disk.failWrites = false;
});

async function launch() {
  const store = await import("@shared/workout-collapse");
  expect(store.isWorkoutCollapseHydrated()).toBe(false);
  const persistence = await import("./workout-collapse-storage");
  await persistence.hydrateWorkoutCollapsePersistence();
  expect(store.isWorkoutCollapseHydrated()).toBe(true);
  return store;
}

it("restores persisted iOS folds on process restart and clears them after finish", async () => {
  const first = await launch();
  first.toggleSessionCollapsed("workout", "exercise");
  expect(JSON.parse(disk.text!)).toEqual({ workout: { exercise: true } });
  vi.resetModules();
  const restarted = await launch();
  expect(restarted.readSessionCollapsed("workout")).toEqual({ exercise: true });
  expect(restarted.readSessionCollapsed("new-workout")).toEqual({});
  restarted.clearSessionCollapsed("workout");
  expect(disk.text).toBeNull();
});

it("keeps the iOS workout usable with corrupt persistence and failed file writes", async () => {
  disk.text = "interrupted file";
  const store = await launch();
  expect(store.readSessionCollapsed("workout")).toEqual({});
  disk.failWrites = true;
  expect(() =>
    store.toggleSessionCollapsed("workout", "exercise"),
  ).not.toThrow();
  expect(store.readSessionCollapsed("workout")).toEqual({ exercise: true });
  expect(() => store.clearSessionCollapsed("workout")).not.toThrow();
  expect(store.readSessionCollapsed("workout")).toEqual({});
});
