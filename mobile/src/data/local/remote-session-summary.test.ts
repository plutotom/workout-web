import { describe, expect, it } from "vitest";
import { remoteSessionSummariesToLocal } from "./remote-session-summary";
import { getLocalOverview, mergeLocalAndRemoteSessions } from "./insights";

describe("remote note summary", () => {
  it("preserves note content with an empty exercise array, credits attendance, and dedupes local edits", () => {
    const completedAt = Date.now();
    const [remote] = remoteSessionSummariesToLocal([
      {
        sessionId: "remote-note",
        templateName: "Note workout",
        completedAt,
        durationMs: 60_000,
        volume: 0,
        sessionKind: "tracked",
        inputMode: "note",
        noteBody: "  Pull up, 10, 9, 9\n",
        noteUnit: "kg",
        exercises: [],
      },
    ]);
    expect(remote).toMatchObject({
      noteBody: "  Pull up, 10, 9, 9\n",
      noteUnit: "kg",
      exercises: [],
    });
    const overview = getLocalOverview([remote], 7, completedAt);
    expect(overview.stats.workoutCount).toBe(1);
    expect(overview.stats.totalVolume).toBe(0);
    expect(overview.topLifts).toEqual([]);
    expect(overview.setsBySlug).toEqual([]);
    const local = {
      ...remote,
      sessionId: "device-note",
      remoteId: remote.sessionId,
      noteBody: "edited locally",
    };
    const merged = mergeLocalAndRemoteSessions([local], [remote]);
    expect(merged).toEqual([local]);
    expect(getLocalOverview(merged, 7, completedAt).stats.workoutCount).toBe(1);
  });

  it("retains list-mode summary volume behavior", () => {
    const completedAt = Date.now();
    const sessions = remoteSessionSummariesToLocal([
      {
        sessionId: "list",
        templateName: "Push",
        completedAt,
        durationMs: 60_000,
        volume: 1500,
        exercises: [{ slug: "bench-press", completedCount: 1 }],
      },
    ]);
    expect(getLocalOverview(sessions, 7, completedAt).stats).toMatchObject({
      workoutCount: 1,
      totalVolume: 1500,
    });
  });
});
