export const SESSION_KEY = "workout.workos.session.v1";
export const USER_KEY = "workout.workos.user.v1";
export const LOCAL_MODE_KEY = "workout.local-mode.v1";

export type MobileUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type TokenResponse = {
  session: string;
  accessToken: string;
  user: MobileUser;
  /** Milliseconds since epoch. Older servers may omit this. */
  expiresAt?: number;
};

export class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

type StoredState = {
  session: string | null;
  userJson: string | null;
  localMode: boolean;
};

type Storage = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  read?: () => Promise<StoredState & { needsMigration: boolean }>;
  write?: (state: StoredState) => Promise<void>;
};

type Snapshot = {
  loading: boolean;
  isResolvingSession: boolean;
  user: MobileUser | null;
  localMode: boolean;
  hasAccessToken: boolean;
};

/** One owner for restoration, rotation, persistence, and foreground recovery. */
export class MobileSessionController {
  private snapshot: Snapshot = {
    loading: true,
    isResolvingSession: false,
    user: null,
    localMode: false,
    hasAccessToken: false,
  };
  private listeners = new Set<() => void>();
  private session: string | null = null;
  private token: string | null = null;
  private expiresAt = 0;
  private generation = 0;
  private restored = false;
  private restoring: Promise<void> | null = null;
  private refreshing: {
    generation: number;
    promise: Promise<string | null>;
  } | null = null;
  private storageQueue: Promise<unknown> = Promise.resolve();
  private pendingState: StoredState | null = null;
  private pendingSave: TokenResponse | null = null;
  private active = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1_000;
  private refreshRequired = false;

  constructor(
    private readonly storage: Storage,
    private readonly request: (
      session: string,
      forceRefresh: boolean,
    ) => Promise<TokenResponse>,
    private readonly canRefresh = () => true,
  ) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(value: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    this.listeners.forEach((listener) => listener());
  }

  private store<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storageQueue.then(operation);
    this.storageQueue = result.catch(() => {});
    return result;
  }

  pause = () => {
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  };

  resume = async () => {
    this.active = true;
    if (!this.restored) await this.restore();
    else {
      this.update({ loading: true });
      try {
        await this.fetchAccessToken();
      } finally {
        this.update({ loading: false });
      }
    }
  };

  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.active) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.resume();
    }, delay);
  }

  private retry() {
    this.schedule(this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
  }

  private scheduleRefresh() {
    this.retryDelay = 1_000;
    if (this.session)
      this.schedule(
        this.expiresAt
          ? Math.max(1_000, this.expiresAt - Date.now() - 60_000)
          : 60_000,
      );
  }

  restore = async (): Promise<void> => {
    if (this.restoring) return this.restoring;
    if (this.restored) return;
    const generation = this.generation;
    const restoring = (async () => {
      try {
        const stored = await this.store(async () => {
          if (this.storage.read) return this.storage.read();
          const [session, userJson, localMode] = await Promise.all([
            this.storage.get(SESSION_KEY),
            this.storage.get(USER_KEY),
            this.storage.get(LOCAL_MODE_KEY),
          ]);
          return {
            session,
            userJson,
            localMode: localMode === "1",
            needsMigration: false,
          };
        });
        const { session, userJson: cachedUser, localMode } = stored;
        if (generation !== this.generation) return;
        this.restored = true;
        this.session = session;
        let user: MobileUser | null = null;
        try {
          const parsed = JSON.parse(cachedUser ?? "null") as MobileUser | null;
          if (
            typeof parsed?.id === "string" &&
            typeof parsed.email === "string"
          )
            user = parsed;
        } catch {
          /* A damaged profile does not invalidate the refresh credential. */
        }
        this.update({
          user: session ? user : null,
          localMode,
          loading: false,
          isResolvingSession: Boolean(session),
        });
        if (stored.needsMigration) {
          this.pendingState = { session, userJson: cachedUser, localMode };
        }
        await this.fetchAccessToken();
      } catch {
        // Keychain can be unavailable while the device is locked. Retry when
        // foregrounded without deleting anything or inventing an empty session.
        if (generation === this.generation) this.retry();
      } finally {
        if (generation === this.generation && this.restored)
          this.update({ loading: false });
      }
    })();
    this.restoring = restoring;
    try {
      await restoring;
    } finally {
      if (this.restoring === restoring) this.restoring = null;
    }
  };

  private validToken(buffer = 0) {
    return this.token && this.expiresAt > Date.now() + buffer
      ? this.token
      : null;
  }

  private async flushState(generation: number) {
    const state = this.pendingState;
    if (!state) return;
    await this.store(async () => {
      if (generation !== this.generation) return;
      if (this.storage.write) await this.storage.write(state);
      else {
        if (state.session !== null)
          await this.storage.set(SESSION_KEY, state.session);
        else await this.storage.remove(SESSION_KEY);
        if (state.userJson !== null)
          await this.storage.set(USER_KEY, state.userJson);
        else await this.storage.remove(USER_KEY);
        if (state.localMode) await this.storage.set(LOCAL_MODE_KEY, "1");
        else await this.storage.remove(LOCAL_MODE_KEY);
      }
    });
    if (this.pendingState === state) this.pendingState = null;
  }

  private async persist(result: TokenResponse, generation: number) {
    this.pendingState = {
      session: result.session,
      userJson: JSON.stringify(result.user),
      localMode: true,
    };
    await this.flushState(generation);
    if (this.pendingSave === result) this.pendingSave = null;
  }

  private async accept(result: TokenResponse, generation: number) {
    if (generation !== this.generation) return null;
    this.session = result.session;
    this.token = result.accessToken;
    // Without expiry metadata, ask the server again instead of caching forever.
    this.expiresAt = result.expiresAt ?? 0;
    this.pendingSave = result;
    await this.persist(result, generation);
    if (generation !== this.generation) return null;
    this.refreshRequired = false;
    this.update({
      user: result.user,
      localMode: true,
      hasAccessToken:
        result.expiresAt === undefined || result.expiresAt > Date.now(),
      loading: false,
    });
    this.scheduleRefresh();
    return result.accessToken;
  }

  fetchAccessToken = async (
    options: boolean | { forceRefreshToken?: boolean } = false,
  ): Promise<string | null> => {
    if (!this.restored) {
      await this.restore();
      return this.validToken();
    }
    const generation = this.generation;
    if (this.refreshing?.generation === generation)
      return this.refreshing.promise;
    const requestedRefresh =
      typeof options === "boolean"
        ? options
        : (options.forceRefreshToken ?? false);
    const force = requestedRefresh || this.refreshRequired;
    if (force) this.refreshRequired = true;
    if (!this.canRefresh()) {
      this.refreshRequired = true;
      return this.validToken();
    }
    if (
      !force &&
      !this.pendingSave &&
      !this.pendingState &&
      this.validToken(60_000)
    ) {
      this.scheduleRefresh();
      return this.token;
    }

    this.update({ isResolvingSession: Boolean(this.session) });
    const promise = (async () => {
      try {
        if (this.pendingState) await this.flushState(generation);
        if (this.pendingSave) {
          // A Keychain write failure must not discard newly rotated tokens.
          const pending = this.pendingSave;
          const token = await this.accept(pending, generation);
          if (generation !== this.generation) return null;
          if (!force && this.validToken(60_000)) return token;
        }
        if (generation !== this.generation || !this.session) return null;
        const result = await this.request(this.session, force);
        return await this.accept(result, generation);
      } catch (error) {
        if (generation !== this.generation) return null;
        if (
          error instanceof AuthRequestError &&
          error.status === 401 &&
          error.code === "session_expired"
        ) {
          await this.clear(false);
          return null;
        }
        const token = this.validToken();
        this.update({ hasAccessToken: Boolean(token) });
        this.retry();
        return token;
      }
    })();
    const operation = { generation, promise };
    this.refreshing = operation;
    try {
      return await promise;
    } finally {
      if (this.refreshing === operation) {
        this.refreshing = null;
        this.update({ isResolvingSession: false });
      }
    }
  };

  signIn = async (authenticate: () => Promise<TokenResponse | null>) => {
    const generation = this.generation;
    const result = await authenticate();
    if (!result || generation !== this.generation) return;
    this.restored = true;
    const nextGeneration = ++this.generation;
    try {
      await this.accept(result, nextGeneration);
    } catch (error) {
      if (nextGeneration === this.generation) this.retry();
      throw error;
    }
  };

  private async clear(explicitSignOut: boolean) {
    ++this.generation;
    this.restored = true;
    this.session = null;
    this.token = null;
    this.expiresAt = 0;
    this.pendingSave = null;
    this.refreshRequired = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.update({
      user: null,
      hasAccessToken: false,
      loading: false,
      isResolvingSession: false,
      ...(explicitSignOut ? { localMode: false } : {}),
    });
    this.pendingState = {
      session: null,
      userJson: null,
      localMode: this.snapshot.localMode,
    };
    try {
      await this.flushState(this.generation);
    } catch {
      this.retry();
    }
  }

  signOut = () => this.clear(true);

  continueOffline = async () => {
    this.update({ localMode: true });
    this.pendingState = {
      session: this.session,
      userJson: this.snapshot.user ? JSON.stringify(this.snapshot.user) : null,
      localMode: true,
    };
    try {
      await this.flushState(this.generation);
    } catch {
      this.retry();
    }
  };

  reconnect = async () => {
    this.update({ loading: true });
    try {
      await this.fetchAccessToken({ forceRefreshToken: true });
    } finally {
      this.update({ loading: false });
    }
  };
}
