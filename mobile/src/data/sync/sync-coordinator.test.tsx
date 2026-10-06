import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncCoordinator } from "./sync-coordinator";

const mocks = vi.hoisted(() => ({
  bootstrap: { serverTime: 1, templates: [] as unknown[] },
  revision: 0,
  applyBootstrap: vi.fn(),
  pending: [] as Array<{
    operationId: string;
    templateId: string;
    snapshot: { remoteId: string | null; name: string; exercises: unknown[] };
  }>,
  push: vi.fn(),
  complete: vi.fn(),
  quarantine: vi.fn(),
  alert: vi.fn(),
  appState: { currentState: "active" },
  stateListener: null as null | ((state: string) => void),
}));
vi.mock("@backend/api", () => ({
  api: {
    routes: {
      ios: {
        bootstrap: { get: "bootstrap" },
        sync: {
          pushSession: "session",
          deleteSession: "delete",
          pushCustomExercise: "custom",
          pushPlace: "place",
          pushMachine: "machine",
          pushTemplate: "template",
        },
      },
    },
  },
}));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.bootstrap,
  useMutation: () => mocks.push,
}));
vi.mock("@/auth/auth-provider", () => ({
  useMobileAuth: () => ({ isAuthenticated: true, user: { id: "user-1" } }),
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  AppState: {
    get currentState() {
      return mocks.appState.currentState;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.stateListener = listener;
      return {
        remove: () => {
          mocks.stateListener = null;
        },
      };
    },
  },
}));
vi.mock("@/data/local/provider", () => ({
  useLocalData: () => ({ applyBootstrap: mocks.applyBootstrap }),
  useLocalSyncStore: () => ({
    revision: mocks.revision,
    getDeviceId: async () => "device-1",
    getPendingPlace: async () => null,
    getPendingMachine: async () => null,
    getPendingCustomExercise: async () => null,
    getPendingSessionDelete: async () => null,
    getPendingSession: async () => null,
    getPendingTemplate: async () => mocks.pending[0] ?? null,
    noteTemplateAttempt: async () => {},
    completeTemplate: mocks.complete,
    quarantineTemplate: mocks.quarantine,
  }),
}));

let renderer: ReactTestRenderer | undefined;
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
async function update() {
  await act(async () => {
    renderer!.update(<SyncCoordinator />);
  });
}
function queued(id: string) {
  return {
    operationId: id,
    templateId: id,
    snapshot: { remoteId: "remote-1", name: "Push", exercises: [] },
  };
}
function deferred() {
  let resolve!: (value: { remoteTemplateId: string }) => void;
  const promise = new Promise<{ remoteTemplateId: string }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.bootstrap = { serverTime: 1, templates: [] };
  mocks.revision = 0;
  mocks.pending = [queued("op-1")];
  mocks.appState.currentState = "active";
  mocks.applyBootstrap.mockReset().mockResolvedValue(undefined);
  mocks.push.mockReset().mockResolvedValue({ remoteTemplateId: "remote-1" });
  mocks.complete.mockReset().mockImplementation(async () => {
    mocks.pending.shift();
  });
  mocks.quarantine.mockReset().mockImplementation(async () => {
    mocks.pending.shift();
  });
  mocks.alert.mockReset();
});
afterEach(async () => {
  if (renderer)
    await act(async () => {
      renderer!.unmount();
    });
  renderer = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function mount() {
  await act(async () => {
    renderer = create(<SyncCoordinator />);
  });
  await tick();
}

describe("sync subscription and outbox coordination", () => {
  it("waits for an upload acknowledgment before applying its cloud echo or starting another upload", async () => {
    const upload = deferred();
    const ack = deferred();
    mocks.push.mockReturnValueOnce(upload.promise);
    mocks.complete.mockImplementationOnce(async () => {
      await ack.promise;
      mocks.pending.shift();
    });
    await mount();
    mocks.bootstrap = { serverTime: 2, templates: [] };
    mocks.revision++;
    await update();
    await tick();
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.applyBootstrap).toHaveBeenCalledTimes(1);
    await act(async () => {
      upload.resolve({ remoteTemplateId: "remote-1" });
    });
    mocks.revision++;
    await update();
    await tick();
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.applyBootstrap).toHaveBeenCalledTimes(1);
    await act(async () => {
      ack.resolve({ remoteTemplateId: "remote-1" });
    });
    await tick();
    expect(mocks.applyBootstrap).toHaveBeenCalledTimes(2);
    expect(mocks.pending).toHaveLength(0);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("retries the same operation after local acknowledgment fails; subscription churn cannot speed it up", async () => {
    mocks.complete.mockRejectedValueOnce(new Error("SQLite busy"));
    await mount();
    expect(mocks.push).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) {
      mocks.bootstrap = { serverTime: i + 2, templates: [] };
      mocks.revision++;
      await update();
    }
    await tick(1999);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(mocks.push).toHaveBeenCalledTimes(2);
    expect(mocks.push.mock.calls.map(([args]) => args.operationId)).toEqual([
      "op-1",
      "op-1",
    ]);
    expect(mocks.pending).toHaveLength(0);
  });

  it("drains more than one batch and does not let a permanent template rejection block the rest", async () => {
    mocks.pending = Array.from({ length: 25 }, (_, i) => queued(`op-${i}`));
    mocks.push.mockRejectedValueOnce(
      new Error("At most 100 templates are allowed"),
    );
    await mount();
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mocks.quarantine).toHaveBeenCalledExactlyOnceWith("op-0");
    expect(mocks.alert).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledTimes(25);
    expect(mocks.pending).toHaveLength(0);
  });

  it("applies cloud changes even when serverTime is unchanged", async () => {
    mocks.pending = [];
    await mount();
    const next = { ...mocks.bootstrap, preferences: { unit: "kg" } };
    mocks.bootstrap = next;
    await update();
    await tick();
    expect(mocks.applyBootstrap).toHaveBeenCalledTimes(2);
    expect(mocks.applyBootstrap).toHaveBeenLastCalledWith(next);
    mocks.revision++;
    await update();
    await tick();
    expect(mocks.applyBootstrap).toHaveBeenCalledTimes(2);
  });
});
