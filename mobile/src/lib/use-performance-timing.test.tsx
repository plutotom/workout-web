import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { measureMobileAsync } from "./performance-timing";
import { useCommitTiming, useLoadTiming } from "./use-performance-timing";

let clock = 0;
let renderer: ReactTestRenderer | undefined;
let startCommit!: () => void;

function Probe({
  enabled = true,
  ready = false,
  scope = "first",
}: {
  enabled?: boolean;
  ready?: boolean;
  scope?: string;
}) {
  useLoadTiming("social.comments", enabled, ready, scope);
  const measureCommit = useCommitTiming("social.comment.ui_commit");
  useEffect(() => {
    startCommit = measureCommit;
  }, [measureCommit]);
  return null;
}

beforeEach(() => {
  clock = 0;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("__DEV__", true);
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(props: Parameters<typeof Probe>[0]) {
  await act(async () => {
    if (renderer) renderer.update(<Probe {...props} />);
    else renderer = create(<Probe {...props} />);
  });
}

function events() {
  return vi.mocked(console.debug).mock.calls.map(
    (call) =>
      call[1] as {
        name: string;
        event: string;
        durationMs?: number;
        outcome?: string;
        alreadyAvailable?: boolean;
      },
  );
}

describe("mobile loading and React commit timing", () => {
  it("starts after auth enables the query and finishes only once data arrives", async () => {
    await render({ enabled: false });
    expect(events()).toEqual([]);
    clock = 100;
    await render({ enabled: true });
    clock = 800;
    await render({ ready: true });
    await render({ ready: true });
    expect(events()).toEqual([
      expect.objectContaining({ event: "start", alreadyAvailable: false }),
      expect.objectContaining({
        event: "finish",
        durationMs: 700,
        outcome: "success",
      }),
    ]);
  });

  it("distinguishes data already available when the subscription is observed", async () => {
    await render({ ready: true });
    expect(events()[0]).toMatchObject({
      event: "start",
      alreadyAvailable: true,
    });
    expect(events()[1]).toMatchObject({ event: "finish", durationMs: 0 });
  });

  it("cancels old measurements when changing profiles or disabling authentication", async () => {
    await render({ scope: "private-profile-id" });
    clock = 200;
    await render({ scope: "second-profile-id" });
    clock = 300;
    await render({ enabled: false, scope: "second-profile-id" });
    expect(events().filter((event) => event.event === "finish")).toEqual([
      expect.objectContaining({ durationMs: 200, outcome: "cancelled" }),
      expect.objectContaining({ durationMs: 100, outcome: "cancelled" }),
    ]);
    expect(JSON.stringify(events())).not.toContain("profile-id");
  });

  it("records UI feedback independently of a slow server confirmation", async () => {
    await render({ ready: true });
    vi.mocked(console.debug).mockClear();
    let resolve!: (value: boolean) => void;
    startCommit();
    const confirmation = measureMobileAsync(
      "social.comment.confirmation",
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    clock = 16;
    await render({ ready: true });
    expect(events()).toContainEqual(
      expect.objectContaining({
        name: "social.comment.ui_commit",
        event: "finish",
        durationMs: 16,
      }),
    );
    expect(events()).not.toContainEqual(
      expect.objectContaining({
        name: "social.comment.confirmation",
        event: "finish",
      }),
    );
    clock = 15_000;
    resolve(true);
    await confirmation;
    expect(events()).toContainEqual(
      expect.objectContaining({
        name: "social.comment.confirmation",
        event: "finish",
        durationMs: 15_000,
      }),
    );
  });

  it("cancels outstanding work on unmount instead of attributing it to another screen", async () => {
    await render({});
    startCommit();
    clock = 250;
    await act(async () => renderer?.unmount());
    renderer = undefined;
    expect(events().filter((event) => event.event === "finish")).toEqual([
      expect.objectContaining({
        name: "social.comments",
        outcome: "cancelled",
      }),
      expect.objectContaining({
        name: "social.comment.ui_commit",
        outcome: "cancelled",
      }),
    ]);
  });
});
