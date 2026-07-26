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
  user: MobileUser | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
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
  const sessionRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const accept = useCallback(async (result: TokenResponse) => {
    sessionRef.current = result.session;
    accessTokenRef.current = result.accessToken;
    setUser(result.user);
    await SecureStore.setItemAsync(SESSION_KEY, result.session, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return result.accessToken;
  }, []);

  const clear = useCallback(async (expectedSession?: string) => {
    if (expectedSession && sessionRef.current !== expectedSession) return;
    sessionRef.current = null;
    accessTokenRef.current = null;
    setUser(null);
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(SESSION_KEY);
        if (!stored || !active) return;
        sessionRef.current = stored;
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

  const value = useMemo(
    () => ({
      loading,
      isLoading: loading,
      isAuthenticated: Boolean(user),
      user,
      signIn,
      signOut,
      fetchAccessToken,
    }),
    [fetchAccessToken, loading, signIn, signOut, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useMobileAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useMobileAuth must be used within AuthProvider");
  return value;
}
