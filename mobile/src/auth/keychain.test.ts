import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  values: new Map<string, string>(),
  deleted: [] as string[],
  setCalls: [] as Array<{ key: string; options: unknown }>,
  locked: false,
  lockError: () =>
    new Error(
      "Calling the 'getValueWithKeyAsync' function has failed → Caused by: User interaction is not allowed.",
    ),
}));

vi.mock("expo-secure-store", () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 2,
  getItemAsync: async (key: string) => {
    if (store.locked) throw store.lockError();
    return store.values.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string, options?: unknown) => {
    if (store.locked) throw store.lockError();
    store.setCalls.push({ key, options });
    store.values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (store.locked) throw store.lockError();
    store.deleted.push(key);
    store.values.delete(key);
  },
}));

import {
  deleteAuthKeys,
  isKeychainLockedError,
  persistAuthKeys,
  readAuthKeys,
  SESSION_KEY,
  USER_KEY,
  LOCAL_MODE_KEY,
} from "./keychain";

describe("isKeychainLockedError", () => {
  it("detects locked-device Keychain failures", () => {
    expect(
      isKeychainLockedError(
        new Error(
          "Calling the 'getValueWithKeyAsync' function has failed → Caused by: User interaction is not allowed.",
        ),
      ),
    ).toBe(true);
    expect(
      isKeychainLockedError(new Error("errSecInteractionNotAllowed")),
    ).toBe(true);
    expect(
      isKeychainLockedError(
        new Error(
          "No keychain is available. You may need to restart your computer.",
        ),
      ),
    ).toBe(true);
  });

  it("does not treat ordinary storage errors as locked", () => {
    expect(isKeychainLockedError(new Error("Key not found"))).toBe(false);
    expect(isKeychainLockedError(new Error("Authentication failed"))).toBe(
      false,
    );
  });
});

describe("auth Keychain accessibility", () => {
  beforeEach(() => {
    store.values.clear();
    store.deleted = [];
    store.setCalls = [];
    store.locked = false;
  });

  it("deletes then rewrites with AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY", async () => {
    await persistAuthKeys({
      session: "sealed",
      userJson: JSON.stringify({ id: "user_1" }),
    });
    expect(store.deleted).toEqual([SESSION_KEY, USER_KEY, LOCAL_MODE_KEY]);
    expect(store.setCalls.map((call) => call.options)).toEqual([
      { keychainAccessible: 2 },
      { keychainAccessible: 2 },
      { keychainAccessible: 2 },
    ]);
    expect(store.values.get(SESSION_KEY)).toBe("sealed");
  });

  it("migrates existing keys on a successful unlocked read", async () => {
    store.values.set(SESSION_KEY, "sealed");
    store.values.set(USER_KEY, '{"id":"user_1"}');
    store.values.set(LOCAL_MODE_KEY, "1");
    const stored = await readAuthKeys();
    expect(stored.session).toBe("sealed");
    expect(store.deleted).toEqual([SESSION_KEY, USER_KEY, LOCAL_MODE_KEY]);
    expect(store.setCalls.every((call) => call.options)).toBeTruthy();
    expect(store.values.get(SESSION_KEY)).toBe("sealed");
  });

  it("does not treat a locked read as a reason to delete keys", async () => {
    store.values.set(SESSION_KEY, "sealed");
    store.locked = true;
    await expect(readAuthKeys()).rejects.toThrow(/interaction is not allowed/i);
    await expect(deleteAuthKeys()).rejects.toThrow(
      /interaction is not allowed/i,
    );
    store.locked = false;
    expect(store.values.get(SESSION_KEY)).toBe("sealed");
  });
});
