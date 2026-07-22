import { describe, expect, it } from "vitest";

import { groundSessionDraft, sessionDraftSchema } from "./session-draft";

describe("groundSessionDraft", () => {
  const allowed = new Set(["bench-press", "squat", "row", "ohp", "deadlift"]);
  const existing = new Set(["bench-press", "squat", "row"]);

  it("grounds removals to existing slugs and adds to catalog", () => {
    const { draft, droppedSlugs } = groundSessionDraft(
      {
        removeSlugs: ["squat", "row", "unknown", "squat"],
        add: [
          {
            slug: "deadlift",
            sets: [
              { weight: 225.4, reps: 5.2 },
              { weight: -1, reps: 0 },
            ],
          },
          { slug: "bench-press", sets: [{ weight: 0, reps: 8 }] },
          { slug: "nope", sets: [{ weight: 0, reps: 10 }] },
        ],
      },
      allowed,
      existing,
    );

    expect(draft.removeSlugs).toEqual(["squat", "row"]);
    expect(draft.add).toEqual([
      {
        slug: "deadlift",
        sets: [
          { weight: 225, reps: 5 },
          { weight: 0, reps: 0 },
        ],
      },
    ]);
    expect(droppedSlugs).toEqual(["unknown", "bench-press", "nope"]);
  });

  it("allows re-adding a slug that is being removed", () => {
    const { draft, droppedSlugs } = groundSessionDraft(
      {
        removeSlugs: ["row"],
        add: [{ slug: "row", sets: [{ weight: 0, reps: 10 }] }],
      },
      allowed,
      existing,
    );
    expect(draft.removeSlugs).toEqual(["row"]);
    expect(draft.add).toEqual([
      { slug: "row", sets: [{ weight: 0, reps: 10 }] },
    ]);
    expect(droppedSlugs).toEqual([]);
  });

  it("fills empty add sets with a zero preset row", () => {
    const { draft } = groundSessionDraft(
      { removeSlugs: [], add: [{ slug: "ohp", sets: [] }] },
      allowed,
      existing,
    );
    expect(draft.add[0]?.sets).toEqual([{ weight: 0, reps: 0 }]);
  });
});

describe("sessionDraftSchema", () => {
  it("accepts remove-only and add-only drafts", () => {
    expect(
      sessionDraftSchema.parse({
        removeSlugs: ["squat"],
        add: [],
      }).removeSlugs,
    ).toEqual(["squat"]);

    expect(
      sessionDraftSchema.parse({
        removeSlugs: [],
        add: [{ slug: "ohp", sets: [{ weight: 0, reps: 8 }] }],
      }).add,
    ).toHaveLength(1);
  });
});
