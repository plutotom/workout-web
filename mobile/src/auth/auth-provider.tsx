import * as SecureStore from "expo-secure-store";
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

import { requirePublicConfig } from "@/lib/config";

WebBrowser.maybeCompleteAuthSession();

const SESSION_KEY = "workout.workos.session.v1";
const USER_KEY = "workout.workos.user.v1";
const LOCAL_MODE_KEY = "workout.local-mode.v1";

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

async function postToken(path: string, body: unknown): Promise<TokenResponse> {
  const { webUrl } = requirePublicConfig();
  const response = await fetch(`${webUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as TokenResponse & { error?: string };
  if (!response.ok)
    throw new AuthRequestError(
      result.error ?? "Authentication failed",
      response.status,
    );
  return result;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MobileUser | null>(null);
  const [localMode, setLocalMode] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const accept = useCallback(async (result: TokenResponse) => {
    sessionRef.current = result.session;
    accessTokenRef.current = result.accessToken;
    setUser(result.user);
    setLocalMode(true);
    await Promise.all([
      SecureStore.setItemAsync(SESSION_KEY, result.session, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
      SecureStore.setItemAsync(LOCAL_MODE_KEY, "1", {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    ]);
    return result.accessToken;
  }, []);

  const clear = useCallback(async (expectedSession?: string) => {
    if (expectedSession && sessionRef.current !== expectedSession) return;
    sessionRef.current = null;
    accessTokenRef.current = null;
    setUser(null);
    setLocalMode(false);
    await Promise.all([
      SecureStore.deleteItemAsync(SESSION_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      SecureStore.deleteItemAsync(LOCAL_MODE_KEY),
    ]);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [stored, cachedUser, storedLocalMode] = await Promise.all([
          SecureStore.getItemAsync(SESSION_KEY),
          SecureStore.getItemAsync(USER_KEY),
          SecureStore.getItemAsync(LOCAL_MODE_KEY),
        ]);
        if (!active) return;
        if (storedLocalMode === "1") setLocalMode(true);
        if (!stored) return;
        sessionRef.current = stored;
        if (cachedUser) {
          try {
            setUser(JSON.parse(cachedUser) as MobileUser);
            setLoading(false);
          } catch {
            await SecureStore.deleteItemAsync(USER_KEY);
          }
        }
        const result = await postToken("/api/mobile-auth/token", {
          session: stored,
        });
        if (active) await accept(result);
      } catch (error) {
        if (active && invalidSession(error)) await clear();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accept, clear]);

  const fetchAccessToken = useCallback(
    async (options: boolean | { forceRefreshToken?: boolean } = false) => {
      const forceRefresh =
        typeof options === "boolean"
          ? options
          : (options.forceRefreshToken ?? false);
      const activeSession = sessionRef.current;
      const cachedToken = accessTokenRef.current;
      if (!activeSession) return cachedToken;
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
  }, [accept]);

  const signOut = useCallback(async () => {
    await clear();
  }, [clear]);

  const continueOffline = useCallback(async () => {
    setLocalMode(true);
    await SecureStore.setItemAsync(LOCAL_MODE_KEY, "1", {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }, []);

  const value = useMemo(
    () => ({
      loading,
      isLoading: loading,
      isAuthenticated: Boolean(user),
      canUseApp: localMode || Boolean(user),
      user,
      signIn,
      signOut,
      continueOffline,
      fetchAccessToken,
    }),
    [
      continueOffline,
      fetchAccessToken,
      loading,
      localMode,
      signIn,
      signOut,
      user,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useMobileAuth must be used within AuthProvider");
  return value;
}
