import * as SecureStore from "expo-secure-store";

// Legacy items remain intact until the complete replacement has been saved.
export const SESSION_KEY = "workout.workos.session.v1";
export const USER_KEY = "workout.workos.user.v1";
export const LOCAL_MODE_KEY = "workout.local-mode.v1";
export const AUTH_STATE_KEY = "workout.auth.v2";

export type StoredAuthKeys = {
  session: string | null;
  userJson: string | null;
  localMode: boolean;
};

export const SIGNED_OUT_AUTH_KEYS: StoredAuthKeys = {
  session: null,
  userJson: null,
  localMode: false,
};

const STORE_OPTIONS = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export function isKeychainLockedError(error: unknown) {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : String(error ?? "");
  const lower = text.toLowerCase();
  return (
    lower.includes("user interaction is not allowed") ||
    lower.includes("errsecinteractionnotallowed") ||
    lower.includes("interaction not allowed") ||
    lower.includes("no keychain is available")
  );
}

export async function persistStoredAuthKeys(input: StoredAuthKeys) {
  // SecureStore updates this item in place. Session, profile and local mode
  // change together; no delete-before-write gap on migration or rotation.
  await SecureStore.setItemAsync(
    AUTH_STATE_KEY,
    JSON.stringify(input),
    STORE_OPTIONS,
  );
  const cleanup = await Promise.allSettled(
    [SESSION_KEY, USER_KEY, LOCAL_MODE_KEY].map((key) =>
      SecureStore.deleteItemAsync(key),
    ),
  );
  if (cleanup.some((result) => result.status === "rejected")) {
    console.warn("[auth] legacy Keychain cleanup will retry on the next save");
  }
}

export async function persistAuthKeys(input: {
  session: string;
  userJson: string;
}) {
  await persistStoredAuthKeys({ ...input, localMode: true });
}

export async function readAuthKeys() {
  const value = await SecureStore.getItemAsync(AUTH_STATE_KEY);
  if (value !== null) {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("session" in parsed) ||
      !("userJson" in parsed) ||
      !("localMode" in parsed) ||
      (parsed.session !== null && typeof parsed.session !== "string") ||
      (parsed.userJson !== null && typeof parsed.userJson !== "string") ||
      typeof parsed.localMode !== "boolean"
    )
      throw new Error("Invalid auth Keychain state");
    return {
      session: parsed.session,
      userJson: parsed.userJson,
      localMode: parsed.localMode,
      needsMigration: false,
    };
  }
  const [session, userJson, localMode] = await Promise.all([
    SecureStore.getItemAsync(SESSION_KEY),
    SecureStore.getItemAsync(USER_KEY),
    SecureStore.getItemAsync(LOCAL_MODE_KEY),
  ]);
  // Reading is side-effect free. The provider serializes migration with
  // refreshes and sign-out and queues failed copies for foreground retry.
  return {
    session,
    userJson,
    localMode: localMode === "1",
    needsMigration: session !== null || userJson !== null || localMode !== null,
  };
}

export async function deleteAuthKeys() {
  // Keep an authoritative signed-out snapshot. Failed legacy cleanup must
  // never make an old account reappear on the next launch.
  await persistStoredAuthKeys(SIGNED_OUT_AUTH_KEYS);
}
