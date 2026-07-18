import { describe, expect, it } from "vitest";

import {
  formatCatalogForPrompt,
  groundTemplateDraft,
  templateDraftSchema,
} from "./template-draft";

describe("groundTemplateDraft", () => {
  const allowed = new Set(["bench-press", "squat", "row"]);

  it("keeps known slugs and clamps sets", () => {
    const { draft, droppedSlugs } = groundTemplateDraft(
      {
        name: "  Push  ",
        exercises: [
          {
            slug: "bench-press",
            sets: [
              { weight: 135.4, reps: 8.2 },
              { weight: -1, reps: 0 },
            ],
          },
          { slug: "unknown-lift", sets: [{ weight: 0, reps: 10 }] },
          { slug: "bench-press", sets: [{ weight: 0, reps: 5 }] },
        ],
      },
      allowed,
    );

    expect(draft.name).toBe("Push");
    expect(draft.exercises).toEqual([
      {
        slug: "bench-press",
        sets: [
          { weight: 135, reps: 8 },
          { weight: 0, reps: 0 },
        ],
      },
    ]);
    expect(droppedSlugs).toEqual(["unknown-lift", "bench-press"]);
  });

  it("fills empty sets with a zero preset row", () => {
    const { draft } = groundTemplateDraft(
      { name: "Legs", exercises: [{ slug: "squat", sets: [] }] },
      allowed,
    );
    expect(draft.exercises[0]?.sets).toEqual([{ weight: 0, reps: 0 }]);
  });
});

describe("templateDraftSchema", () => {
  it("accepts a valid draft", () => {
    const parsed = templateDraftSchema.parse({
      name: "Pull",
      exercises: [
        {
          slug: "row",
          sets: [
            { weight: 0, reps: 10 },
            { weight: 0, reps: 10 },
          ],
        },
      ],
    });
    expect(parsed.name).toBe("Pull");
  });
});

describe("formatCatalogForPrompt", () => {
  it("formats slug | name | category lines", () => {
    expect(
      formatCatalogForPrompt([
        { slug: "squat", name: "Squat", category: "legs" },
      ]),
    ).toBe("squat | Squat | legs");
  });
});
