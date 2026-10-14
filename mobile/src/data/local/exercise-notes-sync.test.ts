import { describe, expect, it } from "vitest";

import {
  resolveBootstrappedExerciseNote,
  shouldAdoptCloudExerciseNote,
} from "./exercise-notes-sync";

describe("shouldAdoptCloudExerciseNote", () => {
  it("keeps a queued local edit and adopts cloud when nothing is pending", () => {
    expect(shouldAdoptCloudExerciseNote(true)).toBe(false);
    expect(shouldAdoptCloudExerciseNote(false)).toBe(true);
  });
});

describe("resolveBootstrappedExerciseNote", () => {
  it("does not clobber a local offline edit with a stale cloud note", () => {
    expect(
      resolveBootstrappedExerciseNote({
        pending: true,
        local: "pause at the bottom",
        cloud: "old cue",
      }),
    ).toBe("pause at the bottom");
  });

  it("adopts the cloud note once the outbox is empty", () => {
    expect(
      resolveBootstrappedExerciseNote({
        pending: false,
        local: "pause at the bottom",
        cloud: "new cue from web",
      }),
    ).toBe("new cue from web");
  });
});
