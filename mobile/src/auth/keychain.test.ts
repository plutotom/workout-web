import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  values: new Map<string, string>(),
  deleted: [] as string[],
  setCalls: [] as Array<{ key: string; options: unknown }>,
  locked: false,
  writeError: null as Error | null,
  deleteError: null as Error | null,
  lockError: () => new Error("User interaction is not allowed."),
}));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
  getItemAsync: async (key: string) => {
    if (store.locked) throw store.lockError();
    return store.values.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string, options?: unknown) => {
    if (store.locked) throw store.lockError();
    if (store.writeError) throw store.writeError;
    store.setCalls.push({ key, options });
    store.values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (store.locked) throw store.lockError();
    if (store.deleteError) throw store.deleteError;
    // Legacy deletion must happen only after a complete snapshot is durable.
    expect(store.values.has("workout.auth.v2")).toBe(true);
    store.deleted.push(key);
    store.values.delete(key);
  },
}));

import {
  AUTH_STATE_KEY,
  deleteAuthKeys,
  isKeychainLockedError,
  persistAuthKeys,
  persistStoredAuthKeys,
  readAuthKeys,
  SESSION_KEY,
  USER_KEY,
  LOCAL_MODE_KEY,
} from "./keychain";

const session = {
  session: "sealed",
  userJson: '{"id":"user_1"}',
  localMode: true,
};

beforeEach(() => {
  store.values.clear();
  store.deleted = [];
  store.setCalls = [];
  store.locked = false;
  store.writeError = null;
  store.deleteError = null;
});

function legacy() {
  store.values.set(SESSION_KEY, session.session);
  store.values.set(USER_KEY, session.userJson);
  store.values.set(LOCAL_MODE_KEY, "1");
}

describe("isKeychainLockedError", () => {
  it.each([
    "Calling the 'getValueWithKeyAsync' function has failed → Caused by: User interaction is not allowed.",
    "errSecInteractionNotAllowed",
    "No keychain is available. You may need to restart your computer.",
  ])("detects a locked-device failure: %s", (message) => {
    expect(isKeychainLockedError(new Error(message))).toBe(true);
  });
  it("does not treat ordinary storage errors as locked", () => {
    expect(isKeychainLockedError(new Error("Key not found"))).toBe(false);
    expect(isKeychainLockedError(new Error("Authentication failed"))).toBe(
      false,
    );
  });
});

describe("auth Keychain snapshots", () => {
  it("saves the new accessibility class before deleting any legacy items", async () => {
    legacy();
    const stored = await readAuthKeys();
    expect(stored).toEqual({ ...session, needsMigration: true });
    expect(store.deleted).toEqual([]);
    await persistStoredAuthKeys(session);
    expect(store.setCalls).toEqual([
      { key: AUTH_STATE_KEY, options: { keychainAccessible: 2 } },
    ]);
    expect(store.deleted).toEqual([SESSION_KEY, USER_KEY, LOCAL_MODE_KEY]);
    expect(await readAuthKeys()).toEqual({ ...session, needsMigration: false });
  });

  it("preserves legacy credentials if the migration write fails", async () => {
    legacy();
    store.writeError = new Error("Keychain write failed");
    await expect(persistStoredAuthKeys(session)).rejects.toThrow(
      "Keychain write failed",
    );
    expect(store.deleted).toEqual([]);
    expect(await readAuthKeys()).toEqual({ ...session, needsMigration: true });
    store.writeError = null;
    await persistStoredAuthKeys(session);
    expect(await readAuthKeys()).toEqual({ ...session, needsMigration: false });
  });

  it("preserves the previous snapshot when an ordinary update fails", async () => {
    await persistAuthKeys(session);
    store.deleted = [];
    store.writeError = new Error("Keychain write failed");
    await expect(
      persistAuthKeys({ ...session, session: "rotated" }),
    ).rejects.toThrow();
    expect(store.deleted).toEqual([]);
    expect(JSON.parse(store.values.get(AUTH_STATE_KEY)!)).toEqual(session);
  });

  it("never restores legacy credentials after sign-out, even if cleanup fails", async () => {
    legacy();
    store.deleteError = new Error("Keychain delete failed");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await deleteAuthKeys();
      expect(store.values.get(SESSION_KEY)).toBe(session.session);
      expect(await readAuthKeys()).toEqual({
        session: null,
        userJson: null,
        localMode: false,
        needsMigration: false,
      });
    } finally {
      warning.mockRestore();
    }
  });

  it("leaves legacy items intact when the device is locked", async () => {
    legacy();
    store.locked = true;
    await expect(readAuthKeys()).rejects.toThrow(/interaction is not allowed/i);
    await expect(deleteAuthKeys()).rejects.toThrow(
      /interaction is not allowed/i,
    );
    expect(store.deleted).toEqual([]);
    expect(store.values.get(SESSION_KEY)).toBe(session.session);
  });
});
