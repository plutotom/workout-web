import { describe, expect, it } from "vitest";

import { sessionDraftReviewCopy } from "./session-draft-review";

describe("sessionDraftReviewCopy", () => {
  it("summarizes AI set presets so Apply shows 4 × 8 not just the slug", () => {
    expect(
      sessionDraftReviewCopy(
        {
          removeSlugs: ["squat"],
          add: [
            {
              slug: "bench",
              sets: [
                { weight: 135, reps: 8 },
                { weight: 135, reps: 8 },
                { weight: 135, reps: 8 },
                { weight: 135, reps: 8 },
              ],
            },
          ],
        },
        (slug) => (slug === "bench" ? "Bench" : "Squat"),
      ),
    ).toBe("Remove: Squat\n\nAdd: Bench (4 × 8)");
  });
});
