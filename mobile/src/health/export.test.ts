import { describe, expect, it } from "vitest";

import { healthExportEndMs, shouldQueueHealthExport } from "./export";
import { healthSyncIdentifier } from "./mapping";

describe("shouldQueueHealthExport", () => {
  it("queues a finished tracked workout when export is on and no Health UUID exists", () => {
    expect(
      shouldQueueHealthExport({
        exportEnabled: true,
        status: "completed",
        sessionKind: "tracked",
        externalId: null,
      }),
    ).toBe(true);
  });

  it("does not queue when export is off, the session is a summary, or a UUID is already attached", () => {
    expect(
      shouldQueueHealthExport({
        exportEnabled: false,
        status: "completed",
        sessionKind: "tracked",
        externalId: null,
      }),
    ).toBe(false);
    expect(
      shouldQueueHealthExport({
        exportEnabled: true,
        status: "in_progress",
        sessionKind: "tracked",
        externalId: null,
      }),
    ).toBe(false);
    expect(
      shouldQueueHealthExport({
        exportEnabled: true,
        status: "completed",
        sessionKind: "health_summary",
        externalId: null,
      }),
    ).toBe(false);
    expect(
      shouldQueueHealthExport({
        exportEnabled: true,
        status: "completed",
        sessionKind: "tracked",
        externalId: "already-linked",
      }),
    ).toBe(false);
  });
});

describe("health export identifiers", () => {
  it("builds a stable HealthKit sync identifier from the session id", () => {
    expect(healthSyncIdentifier("abc")).toBe(
      "com.isaiahproctor.workout.local:session:abc",
    );
  });

  it("ensures HealthKit end is after start for zero-length sessions", () => {
    expect(healthExportEndMs(1000, 1000)).toBe(2000);
    expect(healthExportEndMs(1000, 5000)).toBe(5000);
  });
});
