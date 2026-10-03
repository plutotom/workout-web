import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import {
  startMobileTiming,
  type MobileTimingName,
  type TimingOutcome,
} from "./performance-timing";

/** Measure subscription readiness separately from authentication. Scope is never logged. */
export function useLoadTiming(
  name: MobileTimingName,
  enabled: boolean,
  settled: boolean,
  scope = "",
  outcome: TimingOutcome = "success",
) {
  const current = useRef<{
    name: MobileTimingName;
    scope: string;
    done: boolean;
    finish: ReturnType<typeof startMobileTiming> | null;
  } | null>(null);

  useEffect(() => {
    let timing = current.current;
    if (
      !enabled ||
      (timing && (timing.name !== name || timing.scope !== scope))
    ) {
      timing?.finish?.("cancelled");
      current.current = null;
      timing = null;
    }
    if (!enabled) return;
    if (!timing || (timing.done && !settled)) {
      timing = {
        name,
        scope,
        done: false,
        finish: startMobileTiming(name, settled),
      };
      current.current = timing;
    }
    if (settled && !timing.done) {
      timing.finish?.(outcome);
      timing.finish = null;
      timing.done = true;
    }
  }, [name, enabled, settled, scope, outcome]);

  useEffect(
    () => () => {
      current.current?.finish?.("cancelled");
      current.current = null;
    },
    [],
  );
}

/** Time to the next React commit, not a claim about when iOS presents a frame. */
export function useCommitTiming(name: MobileTimingName) {
  const pending = useRef<ReturnType<typeof startMobileTiming>[]>([]);
  useLayoutEffect(() => {
    const timings = pending.current;
    pending.current = [];
    timings.forEach((finish) => finish());
  });
  useEffect(
    () => () => {
      pending.current.forEach((finish) => finish("cancelled"));
      pending.current = [];
    },
    [],
  );
  return useCallback(() => {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      pending.current.push(startMobileTiming(name));
    }
  }, [name]);
}
