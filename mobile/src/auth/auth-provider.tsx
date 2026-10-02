import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { requirePublicConfig } from "../lib/config";
import { MobileAccountContext } from "./account-context";
import {
  isKeychainLockedError,
  persistStoredAuthKeys,
  SIGNED_OUT_AUTH_KEYS,
  type StoredAuthKeys,
  readAuthKeys,
} from "./keychain";

WebBrowser.maybeCompleteAuthSession();

type MobileUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

type TokenResponse = {
  session: string;
  accessToken: string;
  user: MobileUser;
};

type AuthContextValue = {
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  canUseApp: boolean;
  user: MobileUser | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  continueOffline: () => Promise<void>;
  reconnect: () => Promise<void>;
  fetchAccessToken: (
    options?: boolean | { forceRefreshToken?: boolean },
  ) => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

function invalidSession(error: unknown) {
  return error instanceof AuthRequestError && error.status === 401;
}

function canPersistSecrets() {
  return AppState.currentState === "active";
}

async function postToken(path: string, body: unknown): Promise<TokenResponse> {
  const { webUrl } = requirePublicConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${webUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = (await response.json()) as TokenResponse & {
      error?: string;
    };
    if (!response.ok)
      throw new AuthRequestError(
        result.error ?? "Authentication failed",
        response.status,
      );
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  const pendingPersist = useRef<{
    keys: StoredAuthKeys;
    generation: number;
  } | null>(null);
  const keychainLocked = useRef(false);
  const hydrated = useRef(false);
  const generation = useRef(0);
  const storageQueue = useRef<Promise<unknown>>(Promise.resolve());
  const refreshDeferred = useRef(false);
  const hydrateInFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  const enqueueStorage = useCallback(<T,>(operation: () => Promise<T>) => {
    const task = storageQueue.current.then(operation);
    storageQueue.current = task.catch(() => undefined);
    return task;
  }, []);

  const commitMemory = useCallback((result: TokenResponse) => {
    sessionRef.current = result.session;
    accessTokenRef.current = result.accessToken;
    setHasAccessToken(true);
    setUser(result.user);
    setLocalMode(true);
  }, []);

  const persistOrQueue = useCallback(
    async (keys: StoredAuthKeys, expectedGeneration: number) => {
      if (generation.current !== expectedGeneration) return false;
      pendingPersist.current = { keys, generation: expectedGeneration };
      return enqueueStorage(async () => {
        if (generation.current !== expectedGeneration) return false;
        try {
          await persistStoredAuthKeys(keys);
          if (generation.current !== expectedGeneration) return false;
          pendingPersist.current = null;
          keychainLocked.current = false;
        } catch (error) {
          if (generation.current !== expectedGeneration) return false;
          keychainLocked.current = isKeychainLockedError(error);
          if (!keychainLocked.current) {
            console.warn("[auth] Keychain save failed; retrying in foreground");
          }
          // WorkOS may already have rotated the refresh token. Retain its
          // replacement for all storage failures, not just device locks.
        }
        return true;
      });
    },
    [enqueueStorage],
  );

  const accept = useCallback(
    async (result: TokenResponse, expectedGeneration: number) => {
      const accepted = await persistOrQueue(
        {
          session: result.session,
          userJson: JSON.stringify(result.user),
          localMode: true,
        },
        expectedGeneration,
      );
      // Sign-out invalidates the generation while a native write is pending.
      // Its queued signed-out snapshot runs after any already-started write.
      if (
        !accepted ||
        !mounted.current ||
        generation.current !== expectedGeneration
      ) {
        return accessTokenRef.current;
      }
      commitMemory(result);
      return result.accessToken;
    },
    [commitMemory, persistOrQueue],
  );

  const clear = useCallback(
    async (expectedSession?: string, expectedGeneration?: number) => {
      if (expectedSession && sessionRef.current !== expectedSession) return;
      if (
        expectedGeneration !== undefined &&
        generation.current !== expectedGeneration
      )
        return;
      const nextGeneration = ++generation.current;
      sessionRef.current = null;
      accessTokenRef.current = null;
      refreshInFlight.current = null;
      refreshDeferred.current = false;
      hydrated.current = true;
      setHasAccessToken(false);
      setUser(null);
      setLocalMode(false);
      setLoading(false);
      await persistOrQueue(SIGNED_OUT_AUTH_KEYS, nextGeneration);
    },
    [persistOrQueue],
  );

  const fetchAccessToken = useCallback(
    async (options: boolean | { forceRefreshToken?: boolean } = false) => {
      const forceRefresh =
        typeof options === "boolean"
          ? options
          : (options.forceRefreshToken ?? false);
      const activeSession = sessionRef.current;
      const cachedToken = accessTokenRef.current;
      if (!activeSession) return cachedToken;
      const persistBlocked =
        !canPersistSecrets() ||
        keychainLocked.current ||
        pendingPersist.current !== null;
      if (persistBlocked && (forceRefresh || !cachedToken)) {
        refreshDeferred.current = true;
        return cachedToken;
      }
      if (cachedToken && !forceRefresh) return cachedToken;
      if (refreshInFlight.current) return refreshInFlight.current;
      const expectedGeneration = generation.current;
      refreshDeferred.current = false;

      const refresh = (async () => {
        try {
          const result = await postToken("/api/mobile-auth/token", {
            session: activeSession,
            forceRefresh,
          });
          if (
            generation.current !== expectedGeneration ||
            sessionRef.current !== activeSession
          )
            return accessTokenRef.current;
          return await accept(result, expectedGeneration);
        } catch (error) {
          if (invalidSession(error))
            await clear(activeSession, expectedGeneration);
          return accessTokenRef.current;
        }
      })();
      refreshInFlight.current = refresh;
      try {
        return await refresh;
      } finally {
        if (refreshInFlight.current === refresh) refreshInFlight.current = null;
      }
    },
    [accept, clear],
  );

  const hydrate = useCallback(async () => {
    if (hydrateInFlight.current) return hydrateInFlight.current;
    const expectedGeneration = generation.current;
    const task = (async () => {
      try {
        const stored = await enqueueStorage(readAuthKeys);
        if (!mounted.current || generation.current !== expectedGeneration)
          return;
        keychainLocked.current = false;
        hydrated.current = true;
        if (stored.localMode) setLocalMode(true);
        sessionRef.current = stored.session;
        if (stored.session && stored.userJson) {
          try {
            setUser(JSON.parse(stored.userJson) as MobileUser);
          } catch {
            // A successful refresh replaces the cached profile.
          }
        }
        setLoading(false);
        if (stored.needsMigration) {
          await persistOrQueue(
            {
              session: stored.session,
              userJson: stored.userJson,
              localMode: stored.localMode,
            },
            expectedGeneration,
          );
        }
        if (generation.current === expectedGeneration && stored.session)
          await fetchAccessToken();
      } catch (error) {
        if (generation.current !== expectedGeneration) return;
        if (isKeychainLockedError(error)) {
          keychainLocked.current = true;
          return;
        }
        console.warn("[auth] Keychain read failed; retrying in foreground");
        setLoading(false);
      }
    })();
    hydrateInFlight.current = task;
    try {
      await task;
    } finally {
      if (hydrateInFlight.current === task) hydrateInFlight.current = null;
    }
  }, [enqueueStorage, fetchAccessToken, persistOrQueue]);

  const flushPendingKeychain = useCallback(async () => {
    const queued = pendingPersist.current;
    if (queued) await persistOrQueue(queued.keys, queued.generation);
  }, [persistOrQueue]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void hydrate();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        await flushPendingKeychain();
        if (!active) return;
        if (!hydrated.current) {
          await hydrate();
        } else if (refreshDeferred.current || !accessTokenRef.current) {
          // Reinstall the Convex auth adapter after a background token refusal
          // as well as retrying the WorkOS refresh itself.
          setLoading(true);
          try {
            await fetchAccessToken({
              forceRefreshToken: refreshDeferred.current,
            });
          } finally {
            if (active) setLoading(false);
          }
        }
      })();
    });
    return () => {
      active = false;
      mounted.current = false;
      sub.remove();
    };
  }, [fetchAccessToken, flushPendingKeychain, hydrate]);

  const signIn = useCallback(async () => {
    const startedGeneration = generation.current;
    const { webUrl } = requirePublicConfig();
    const callback = "workout://auth/callback";
    const start = new URL(`${webUrl}/api/mobile-auth/start`);
    const callbackOrigin = process.env.EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_ORIGIN;
    if (callbackOrigin)
      start.searchParams.set("callback_origin", callbackOrigin);
    const result = await WebBrowser.openAuthSessionAsync(
      start.toString(),
      callback,
      { preferEphemeralSession: false },
    );
    if (result.type !== "success") return;
    const code = new URL(result.url).searchParams.get("code");
    if (!code) throw new Error("WorkOS did not return a mobile exchange code");
    const tokens = await postToken("/api/mobile-auth/exchange", { code });
    if (generation.current !== startedGeneration) return;
    const nextGeneration = ++generation.current;
    refreshInFlight.current = null;
    await accept(tokens, nextGeneration);
    if (generation.current !== nextGeneration) return;
    setLoading(false);
    hydrated.current = true;
  }, [accept]);

  const signOut = useCallback(async () => {
    await clear();
  }, [clear]);

  const reconnect = useCallback(async () => {
    setLoading(true);
    try {
      await flushPendingKeychain();
      await fetchAccessToken({ forceRefreshToken: true });
    } finally {
      setLoading(false);
    }
  }, [fetchAccessToken, flushPendingKeychain]);

  const continueOffline = useCallback(async () => {
    const nextGeneration = ++generation.current;
    setLocalMode(true);
    hydrated.current = true;
    setLoading(false);
    await persistOrQueue(
      {
        session: sessionRef.current,
        userJson: user ? JSON.stringify(user) : null,
        localMode: true,
      },
      nextGeneration,
    );
  }, [persistOrQueue, user]);

  const value = useMemo(
    () => ({
      loading,
      isLoading: loading,
      isAuthenticated: Boolean(user) && hasAccessToken,
      canUseApp: localMode || Boolean(user),
      user,
      signIn,
      signOut,
      continueOffline,
      reconnect,
      fetchAccessToken,
    }),
    [
      continueOffline,
      fetchAccessToken,
      hasAccessToken,
      loading,
      localMode,
      reconnect,
      signIn,
      signOut,
      user,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Only the Convex auth adapter and account bootstrap should use credentials directly. */
export function useAuthCredentials() {
  const value = useContext(AuthContext);
  if (!value)
    throw new Error("useAuthCredentials must be used within AuthProvider");
  return value;
}

/** Cloud features wait for server-confirmed auth and the user's account row. */
export function useMobileAuth() {
  const credentials = useAuthCredentials();
  const account = useContext(MobileAccountContext);
  if (!account) throw new Error("useMobileAuth requires MobileAccountProvider");
  return {
    ...credentials,
    isAuthenticated: account.status === "ready",
    accountStatus: account.status,
    retryAccountConnection: account.retry,
  };
}
