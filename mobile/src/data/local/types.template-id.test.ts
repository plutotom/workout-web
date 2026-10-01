import { describe, expect, it } from "vitest";

import {
  convexWorkoutTemplateId,
  convexWorkoutTemplateIdForQuery,
  isLocalTemplateRouteId,
  localTemplateIdsToPrune,
  localTemplateRemoteId,
} from "./types";

describe("convexWorkoutTemplateId", () => {
  it("strips unsynced local placeholders", () => {
    expect(
      convexWorkoutTemplateId(localTemplateRemoteId("a25520a8-d4df-461d-b36f")),
    ).toBeNull();
  });

  it("passes through real Convex ids", () => {
    expect(convexWorkoutTemplateId("jd7abc123")).toBe("jd7abc123");
  });

  it("normalizes empty values to null", () => {
    expect(convexWorkoutTemplateId(null)).toBeNull();
    expect(convexWorkoutTemplateId(undefined)).toBeNull();
    expect(convexWorkoutTemplateId("")).toBeNull();
  });
});

describe("isLocalTemplateRouteId", () => {
  it("recognizes phone SQLite template ids", () => {
    expect(isLocalTemplateRouteId("b47188d2-2f58-4e7d-ad2f-1ae2273ac285")).toBe(
      true,
    );
  });

  it("rejects Convex document ids", () => {
    expect(isLocalTemplateRouteId("jd7abc123")).toBe(false);
  });
});

describe("convexWorkoutTemplateIdForQuery", () => {
  it("maps a local route id through the synced remote id", () => {
    expect(
      convexWorkoutTemplateIdForQuery("b47188d2-2f58-4e7d-ad2f-1ae2273ac285", {
        remoteId: "jd7abc123",
      }),
    ).toBe("jd7abc123");
  });

  it("waits for SQLite before querying with a local route id", () => {
    expect(
      convexWorkoutTemplateIdForQuery(
        "b47188d2-2f58-4e7d-ad2f-1ae2273ac285",
        undefined,
      ),
    ).toBeNull();
  });

  it("skips unsynced-only templates", () => {
    expect(
      convexWorkoutTemplateIdForQuery("b47188d2-2f58-4e7d-ad2f-1ae2273ac285", {
        remoteId: localTemplateRemoteId("b47188d2-2f58-4e7d-ad2f-1ae2273ac285"),
      }),
    ).toBeNull();
  });
});

describe("localTemplateIdsToPrune", () => {
  it("drops cloud rows the bootstrap no longer lists", () => {
    expect(
      localTemplateIdsToPrune(
        [
          { id: "keep", remoteId: "cloud-a" },
          { id: "gone", remoteId: "cloud-b" },
          { id: "local", remoteId: localTemplateRemoteId("phone") },
        ],
        new Set(["cloud-a"]),
      ),
    ).toEqual(["gone"]);
  });
});
