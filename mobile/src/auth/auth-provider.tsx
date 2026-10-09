import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { requirePublicConfig } from "../lib/config";
import { readAuthKeys, persistStoredAuthKeys } from "./keychain";
import { measureMobileAsync } from "../lib/performance-timing";
import { MobileAccountContext } from "./account-context";
import {
  AuthRequestError,
  MobileSessionController,
  type MobileUser,
  type TokenResponse,
} from "./session-controller";

WebBrowser.maybeCompleteAuthSession();

type AuthContextValue = {
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  isResolvingSession: boolean;
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
      // The native session has its own credentials. Browser cookies must not
      // start a second refresh of the same rotating WorkOS session.
      credentials: "omit",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AuthRequestError(
        typeof result?.error === "string"
          ? result.error
          : "Authentication failed",
        response.status,
        typeof result?.code === "string" ? result.code : undefined,
      );
    }
    if (
      typeof result?.session !== "string" ||
      !result.session ||
      typeof result?.accessToken !== "string" ||
      !result.accessToken ||
      typeof result?.user?.id !== "string" ||
      typeof result?.user?.email !== "string" ||
      (result.expiresAt !== undefined &&
        (typeof result.expiresAt !== "number" ||
          !Number.isFinite(result.expiresAt)))
    ) {
      throw new Error("Invalid account connection response");
    }
    return result as TokenResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(
    () =>
      new MobileSessionController(
        {
          read: () => measureMobileAsync("auth.storage", readAuthKeys),
          write: persistStoredAuthKeys,
          get: SecureStore.getItemAsync,
          set: (key, value) =>
            SecureStore.setItemAsync(key, value, {
              keychainAccessible:
                SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
            }),
          remove: SecureStore.deleteItemAsync,
        },
        (session, forceRefresh) =>
          measureMobileAsync("auth.token", () =>
            postToken("/api/mobile-auth/token", { session, forceRefresh }),
          ),
        () => AppState.currentState === "active",
      ),
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.restore();
    if (AppState.currentState === "active") void controller.resume();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void controller.resume();
      else controller.pause();
    });
    return () => {
      subscription.remove();
      controller.pause();
    };
  }, [controller]);

  const signIn = useCallback(
    () =>
      controller.signIn(async () => {
        const { webUrl } = requirePublicConfig();
        const callback = "workout://auth/callback";
        const start = new URL(`${webUrl}/api/mobile-auth/start`);
        const verifier = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(
          /-/g,
          "",
        );
        const challenge = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          verifier,
        );
        start.searchParams.set("challenge", challenge);
        const callbackOrigin =
          process.env.EXPO_PUBLIC_MOBILE_AUTH_CALLBACK_ORIGIN;
        if (callbackOrigin)
          start.searchParams.set("callback_origin", callbackOrigin);
        const result = await WebBrowser.openAuthSessionAsync(
          start.toString(),
          callback,
          {
            preferEphemeralSession: false,
          },
        );
        if (result.type !== "success") return null;
        const url = new URL(result.url);
        if (
          url.protocol !== "workout:" ||
          url.hostname !== "auth" ||
          url.pathname !== "/callback"
        ) {
          throw new Error("Invalid sign-in callback");
        }
        const code = url.searchParams.get("code");
        if (!code)
          throw new Error("WorkOS did not return a mobile exchange code");
        return measureMobileAsync("auth.exchange", () =>
          postToken("/api/mobile-auth/exchange", { code, verifier }),
        );
      }),
    [controller],
  );

  const value = useMemo(
    () => ({
      loading: snapshot.loading,
      isLoading: snapshot.loading,
      isResolvingSession: snapshot.isResolvingSession,
      isAuthenticated: Boolean(snapshot.user) && snapshot.hasAccessToken,
      canUseApp: snapshot.localMode || Boolean(snapshot.user),
      user: snapshot.user,
      signIn,
      signOut: controller.signOut,
      continueOffline: controller.continueOffline,
      reconnect: controller.reconnect,
      fetchAccessToken: controller.fetchAccessToken,
    }),
    [controller, signIn, snapshot],
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
