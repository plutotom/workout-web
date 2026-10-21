import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WORKOUT_COLLAPSE_STORAGE_KEY,
  clearSessionCollapsed,
  expandCollapsed,
  expandSessionCollapsed,
  parseCollapseStore,
  pruneCollapsed,
  pruneSessionCollapsed,
  readSessionCollapsed,
  readServerCollapsed,
  configureWorkoutCollapseStorage,
  subscribeWorkoutCollapse,
  resetWorkoutCollapseStoreForTests,
  retainCollapsedAcrossReplace,
  retainSessionCollapsedAcrossReplace,
  seedWorkoutCollapseStore,
  serializeCollapseStore,
  toggleCollapsed,
  toggleSessionCollapsed,
  writeSessionCollapsed,
} from "./workout-collapse";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key: string) {
      return data[key] ?? null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}

beforeEach(() => {
  resetWorkoutCollapseStoreForTests();
});

afterEach(() => {
  resetWorkoutCollapseStoreForTests();
});

describe("toggleCollapsed", () => {
  it("collapses a missing id and expands a collapsed one", () => {
    const collapsed = toggleCollapsed({}, "ex-1");
    expect(collapsed).toEqual({ "ex-1": true });
    expect(toggleCollapsed(collapsed, "ex-1")).toEqual({});
  });

  it("leaves other cards alone", () => {
    expect(toggleCollapsed({ "ex-1": true }, "ex-2")).toEqual({
      "ex-1": true,
      "ex-2": true,
    });
  });
});

describe("expandCollapsed", () => {
  it("is a no-op when the card is already open", () => {
    const current = { "ex-1": true } as const;
    expect(expandCollapsed(current, "ex-2")).toBe(current);
  });

  it("opens a collapsed card", () => {
    expect(expandCollapsed({ "ex-1": true, "ex-2": true }, "ex-1")).toEqual({
      "ex-2": true,
    });
  });
});

describe("pruneCollapsed", () => {
  it("drops deleted exercise ids and keeps live ones", () => {
    expect(
      pruneCollapsed({ "ex-1": true, "ex-2": true, "ex-3": true }, [
        "ex-2",
        "ex-3",
      ]),
    ).toEqual({ "ex-2": true, "ex-3": true });
  });

  it("returns the same object when nothing was removed", () => {
    const current = { "ex-1": true } as const;
    expect(pruneCollapsed(current, ["ex-1", "ex-2"])).toBe(current);
  });
});

describe("retainCollapsedAcrossReplace", () => {
  it("keeps the slot's collapse when the id is unchanged", () => {
    const current = { "ex-1": true } as const;
    expect(retainCollapsedAcrossReplace(current, "ex-1", "ex-1")).toBe(current);
  });

  it("moves collapse onto a new slot id", () => {
    expect(
      retainCollapsedAcrossReplace(
        { "ex-old": true, "ex-other": true },
        "ex-old",
        "ex-new",
      ),
    ).toEqual({ "ex-other": true, "ex-new": true });
  });

  it("leaves an expanded slot expanded after replace", () => {
    expect(
      retainCollapsedAcrossReplace(
        { "ex-other": true, "ex-new": true },
        "ex-old",
        "ex-new",
      ),
    ).toEqual({ "ex-other": true });
  });
});

describe("parseCollapseStore", () => {
  it("ignores invalid JSON and non-objects", () => {
    expect(parseCollapseStore(null)).toEqual({});
    expect(parseCollapseStore("not-json")).toEqual({});
    expect(parseCollapseStore("[]")).toEqual({});
    expect(parseCollapseStore("null")).toEqual({});
  });

  it("keeps only true flags on real session keys", () => {
    expect(
      parseCollapseStore(
        JSON.stringify({
          sess: { "ex-1": true, "ex-2": false, "": true },
          "": { "ex-3": true },
          other: ["ex-1"],
        }),
      ),
    ).toEqual({ sess: { "ex-1": true } });
  });
});

describe("session-keyed store", () => {
  it("persists collapse per session through storage", () => {
    const storage = memoryStorage();
    resetWorkoutCollapseStoreForTests(storage);

    toggleSessionCollapsed("sess-a", "ex-1");
    toggleSessionCollapsed("sess-a", "ex-2");
    toggleSessionCollapsed("sess-b", "ex-9");

    expect(readSessionCollapsed("sess-a")).toEqual({
      "ex-1": true,
      "ex-2": true,
    });
    expect(
      JSON.parse(storage.data[WORKOUT_COLLAPSE_STORAGE_KEY] ?? "{}"),
    ).toEqual({
      "sess-a": { "ex-1": true, "ex-2": true },
      "sess-b": { "ex-9": true },
    });

    resetWorkoutCollapseStoreForTests(storage);
    expect(readSessionCollapsed("sess-a")).toEqual({
      "ex-1": true,
      "ex-2": true,
    });
    expect(readSessionCollapsed("sess-b")).toEqual({ "ex-9": true });
    expect(readSessionCollapsed("sess-new")).toEqual({});
  });

  it("starts a new session expanded", () => {
    writeSessionCollapsed("old", { "ex-1": true });
    expect(readSessionCollapsed("fresh")).toEqual({});
  });

  it("removes a deleted exercise and forgets an empty session key", () => {
    const storage = memoryStorage();
    resetWorkoutCollapseStoreForTests(storage);
    writeSessionCollapsed("sess", { "ex-1": true, "ex-2": true });

    expect(pruneSessionCollapsed("sess", ["ex-2"])).toEqual({ "ex-2": true });
    expect(pruneSessionCollapsed("sess", [])).toEqual({});
    expect(storage.data[WORKOUT_COLLAPSE_STORAGE_KEY]).toBeUndefined();
  });

  it("clears a session on finish or discard without touching another", () => {
    const storage = memoryStorage();
    resetWorkoutCollapseStoreForTests(storage);
    writeSessionCollapsed("done", { "ex-1": true });
    writeSessionCollapsed("live", { "ex-9": true });

    clearSessionCollapsed("done");
    expect(readSessionCollapsed("done")).toEqual({});
    expect(readSessionCollapsed("live")).toEqual({ "ex-9": true });
    expect(
      JSON.parse(storage.data[WORKOUT_COLLAPSE_STORAGE_KEY] ?? "{}"),
    ).toEqual({
      live: { "ex-9": true },
    });

    clearSessionCollapsed("live");
    expect(storage.data[WORKOUT_COLLAPSE_STORAGE_KEY]).toBeUndefined();
  });

  it("reopens a card for a note without losing other folds", () => {
    writeSessionCollapsed("sess", { "ex-1": true, "ex-2": true });
    expect(expandSessionCollapsed("sess", "ex-1")).toEqual({ "ex-2": true });
  });

  it("copies collapse across a replaced slot id", () => {
    writeSessionCollapsed("sess", { "ex-old": true });
    expect(
      retainSessionCollapsedAcrossReplace("sess", "ex-old", "ex-new"),
    ).toEqual({
      "ex-new": true,
    });
  });

  it("round-trips the serialized snapshot", () => {
    const snapshot = { sess: { "ex-1": true } } as const;
    expect(parseCollapseStore(serializeCollapseStore(snapshot))).toEqual(
      snapshot,
    );
  });

  it("lets an in-process toggle win over a late disk seed", () => {
    const storage = memoryStorage();
    resetWorkoutCollapseStoreForTests(storage);
    toggleSessionCollapsed("sess", "ex-live");
    seedWorkoutCollapseStore(
      JSON.stringify({ sess: { "ex-stale": true }, other: { "ex-9": true } }),
    );
    expect(readSessionCollapsed("sess")).toEqual({ "ex-live": true });
    expect(readSessionCollapsed("other")).toEqual({});
  });

  it("hydrates from disk when nothing has been edited yet", () => {
    resetWorkoutCollapseStoreForTests(memoryStorage());
    seedWorkoutCollapseStore(JSON.stringify({ sess: { "ex-1": true } }));
    expect(readSessionCollapsed("sess")).toEqual({ "ex-1": true });
  });
});

describe("unavailable persistence", () => {
  it.each(["setItem", "removeItem"] as const)(
    "keeps memory and subscribers working when %s throws",
    (operation) => {
      const storage = memoryStorage();
      resetWorkoutCollapseStoreForTests(storage);
      writeSessionCollapsed("session", { exercise: true });
      let notifications = 0;
      const unsubscribe = subscribeWorkoutCollapse(() => {
        notifications++;
      });
      configureWorkoutCollapseStorage({
        ...storage,
        [operation]() {
          throw new Error("Storage unavailable");
        },
      });
      try {
        expect(() => toggleSessionCollapsed("session", "other")).not.toThrow();
        expect(readSessionCollapsed("session")).toEqual({
          exercise: true,
          other: true,
        });
        expect(() => clearSessionCollapsed("session")).not.toThrow();
        expect(readSessionCollapsed("session")).toEqual({});
        expect(notifications).toBe(2);
      } finally {
        unsubscribe();
      }
    },
  );

  it("keeps the server hydration snapshot empty and stable with saved browser folds", () => {
    const empty = readServerCollapsed();
    seedWorkoutCollapseStore(JSON.stringify({ session: { exercise: true } }));
    expect(readSessionCollapsed("session")).toEqual({ exercise: true });
    expect(readServerCollapsed()).toBe(empty);
    expect(readServerCollapsed()).toEqual({});
  });
});

it("loads the browser collapse store even when reading localStorage throws", async () => {
  vi.resetModules();
  vi.stubGlobal("localStorage", {
    getItem() {
      throw new Error("Storage denied");
    },
    setItem() {},
    removeItem() {},
  });
  try {
    const fresh = await import("./workout-collapse");
    expect(fresh.readSessionCollapsed("session")).toEqual({});
    expect(() =>
      fresh.toggleSessionCollapsed("session", "exercise"),
    ).not.toThrow();
    expect(fresh.readSessionCollapsed("session")).toEqual({ exercise: true });
  } finally {
    vi.unstubAllGlobals();
  }
});
