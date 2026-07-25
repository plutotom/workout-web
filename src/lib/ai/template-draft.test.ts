import { describe, expect, it } from "vitest";

import {
  formatCatalogForPrompt,
  groundTemplateDraft,
  selectCatalogForAiPrompt,
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

  it("accepts fractional weight/reps from the model", () => {
    const parsed = templateDraftSchema.parse({
      name: "Push",
      exercises: [
        {
          slug: "bench-press",
          sets: [{ weight: 135.5, reps: 8.0 }],
        },
      ],
    });
    expect(parsed.exercises[0]?.sets[0]).toEqual({
      weight: 135.5,
      reps: 8,
    });
  });

  it("rejects string weight/reps (OpenAI strict schema expects numbers)", () => {
    expect(() =>
      templateDraftSchema.parse({
        name: "Push",
        exercises: [
          {
            slug: "bench",
            sets: [{ weight: "135", reps: "8" }],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("selectCatalogForAiPrompt", () => {
  it("stays under the max and includes customs + must-include slugs", () => {
    const selected = selectCatalogForAiPrompt({
      customs: [
        { slug: "my-custom-lift", name: "My Custom Lift", category: "arms" },
      ],
      mustIncludeSlugs: ["bench"],
      prompt: "push day with lateral raises",
      max: 40,
    });
    const slugs = selected.map((e) => e.slug);
    expect(selected.length).toBeLessThanOrEqual(40);
    expect(slugs).toContain("my-custom-lift");
    expect(slugs).toContain("bench");
    expect(slugs).toContain("lateral-raise");
  });

  it("is much smaller than the full curated catalog", () => {
    const full = formatCatalogForPrompt(
      selectCatalogForAiPrompt({ prompt: "full body", max: 96 }),
    );
    // Rough guard: compact catalog should not approach the old 280-line dump.
    expect(full.split("\n").length).toBeLessThanOrEqual(96);
    expect(full.length).toBeLessThan(12_000);
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
