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
  deleteAuthKeys,
  isKeychainLockedError,
  persistAuthKeys,
  persistLocalModeKey,
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
  const pendingPersist = useRef<TokenResponse | null>(null);
  const pendingClear = useRef(false);
  const keychainLocked = useRef(false);
  const hydrated = useRef(false);

  const commitMemory = useCallback((result: TokenResponse) => {
    sessionRef.current = result.session;
    accessTokenRef.current = result.accessToken;
    setHasAccessToken(true);
    setUser(result.user);
    setLocalMode(true);
  }, []);

  const persistOrQueue = useCallback(async (result: TokenResponse) => {
    try {
      await persistAuthKeys({
        session: result.session,
        userJson: JSON.stringify(result.user),
      });
      pendingPersist.current = null;
      keychainLocked.current = false;
    } catch (error) {
      if (isKeychainLockedError(error)) {
        keychainLocked.current = true;
        pendingPersist.current = result;
        return;
      }
      throw error;
    }
  }, []);

  const accept = useCallback(
    async (result: TokenResponse) => {
      await persistOrQueue(result);
      commitMemory(result);
      return result.accessToken;
    },
    [commitMemory, persistOrQueue],
  );

  const clear = useCallback(async (expectedSession?: string) => {
    if (expectedSession && sessionRef.current !== expectedSession) return;
    sessionRef.current = null;
    accessTokenRef.current = null;
    pendingPersist.current = null;
    setHasAccessToken(false);
    setUser(null);
    setLocalMode(false);
    try {
      await deleteAuthKeys();
      pendingClear.current = false;
      keychainLocked.current = false;
    } catch (error) {
      if (isKeychainLockedError(error)) {
        keychainLocked.current = true;
        pendingClear.current = true;
        return;
      }
      throw error;
    }
  }, []);

  const fetchAccessToken = useCallback(
    async (options: boolean | { forceRefreshToken?: boolean } = false) => {
      const forceRefresh =
        typeof options === "boolean"
          ? options
          : (options.forceRefreshToken ?? false);
      const activeSession = sessionRef.current;
      const cachedToken = accessTokenRef.current;
      if (!activeSession) return cachedToken;
      const persistBlocked = !canPersistSecrets() || keychainLocked.current;
      // Convex reconnects often force-refresh. Rotating a WorkOS refresh token
      // while Keychain cannot persist it leaves the next cold start with a dead
      // sealed session.
      if (forceRefresh && persistBlocked) return cachedToken;
      if (cachedToken && !forceRefresh) return cachedToken;
      if (refreshInFlight.current) return refreshInFlight.current;

      const refresh = (async () => {
        try {
          const result = await postToken("/api/mobile-auth/token", {
            session: activeSession,
            forceRefresh,
          });
          // A sign-out or newer refresh superseded this response.
          if (sessionRef.current !== activeSession)
            return accessTokenRef.current;
          return await accept(result);
        } catch (error) {
          if (isKeychainLockedError(error)) {
            keychainLocked.current = true;
            return accessTokenRef.current;
          }
          // WorkOS refresh tokens rotate. Only clear when this exact session is
          // still current; a stale concurrent failure must not erase a newer
          // successful refresh. Network/5xx failures remain retryable.
          if (invalidSession(error)) await clear(activeSession);
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
    try {
      const stored = await readAuthKeys();
      keychainLocked.current = false;
      hydrated.current = true;
      if (stored.localMode) setLocalMode(true);
      if (!stored.session) {
        setLoading(false);
        return;
      }
      sessionRef.current = stored.session;
      if (stored.userJson) {
        try {
          setUser(JSON.parse(stored.userJson) as MobileUser);
        } catch {
          // Leave the session; a later persist rewrites the profile blob.
        }
      }
      setLoading(false);
      await fetchAccessToken();
    } catch (error) {
      if (isKeychainLockedError(error)) {
        keychainLocked.current = true;
        if (sessionRef.current || accessTokenRef.current) setLoading(false);
        return;
      }
      hydrated.current = true;
      if (invalidSession(error)) await clear();
      setLoading(false);
    }
  }, [clear, fetchAccessToken]);

  const flushPendingKeychain = useCallback(async () => {
    if (pendingClear.current) {
      await clear();
      return;
    }
    const queued = pendingPersist.current;
    if (!queued) return;
    await persistOrQueue(queued);
  }, [clear, persistOrQueue]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!active) return;
      await hydrate();
    })();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        try {
          await flushPendingKeychain();
        } catch (error) {
          if (!isKeychainLockedError(error)) {
            console.warn("[auth] keychain flush failed", error);
          }
        }
        if (active && !hydrated.current) await hydrate();
      })();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, [flushPendingKeychain, hydrate]);

  const signIn = useCallback(async () => {
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
    await accept(await postToken("/api/mobile-auth/exchange", { code }));
    setLoading(false);
    hydrated.current = true;
  }, [accept]);

  const signOut = useCallback(async () => {
    hydrated.current = true;
    await clear();
  }, [clear]);

  const reconnect = useCallback(async () => {
    setLoading(true);
    try {
      await fetchAccessToken({ forceRefreshToken: true });
    } finally {
      setLoading(false);
    }
  }, [fetchAccessToken]);

  const continueOffline = useCallback(async () => {
    setLocalMode(true);
    hydrated.current = true;
    setLoading(false);
    try {
      await persistLocalModeKey();
      keychainLocked.current = false;
    } catch (error) {
      if (isKeychainLockedError(error)) {
        keychainLocked.current = true;
        return;
      }
      throw error;
    }
  }, []);

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
