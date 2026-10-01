import * as SecureStore from "expo-secure-store";

export const SESSION_KEY = "workout.workos.session.v1";
export const USER_KEY = "workout.workos.user.v1";
export const LOCAL_MODE_KEY = "workout.local-mode.v1";

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

async function rewriteItem(key: string, value: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    if (isKeychainLockedError(error)) throw error;
  }
  await SecureStore.setItemAsync(key, value, STORE_OPTIONS);
}

export async function persistAuthKeys(input: {
  session: string;
  userJson: string;
}) {
  await rewriteItem(SESSION_KEY, input.session);
  await rewriteItem(USER_KEY, input.userJson);
  await rewriteItem(LOCAL_MODE_KEY, "1");
}

export async function persistLocalModeKey() {
  await rewriteItem(LOCAL_MODE_KEY, "1");
}

export async function readAuthKeys() {
  const [session, userJson, localMode] = await Promise.all([
    SecureStore.getItemAsync(SESSION_KEY),
    SecureStore.getItemAsync(USER_KEY),
    SecureStore.getItemAsync(LOCAL_MODE_KEY),
  ]);
  const stored = {
    session,
    userJson,
    localMode: localMode === "1",
  };
  // Existing WHEN_UNLOCKED items keep that class until delete + rewrite.
  try {
    if (session && userJson) {
      await persistAuthKeys({ session, userJson });
    } else if (stored.localMode) {
      await persistLocalModeKey();
    }
  } catch (error) {
    if (!isKeychainLockedError(error)) {
      console.warn("[auth] keychain accessibility migrate failed", error);
    }
  }
  return stored;
}

export async function deleteAuthKeys() {
  const results = await Promise.allSettled([
    SecureStore.deleteItemAsync(SESSION_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
    SecureStore.deleteItemAsync(LOCAL_MODE_KEY),
  ]);
  for (const result of results) {
    if (result.status === "rejected" && isKeychainLockedError(result.reason)) {
      throw result.reason;
    }
  }
}
