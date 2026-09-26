import { describe, expect, it } from "vitest";

import { convexWorkoutTemplateId, localTemplateRemoteId } from "./types";

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
