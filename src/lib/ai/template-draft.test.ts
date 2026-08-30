import { describe, expect, it } from "vitest";

import {
  formatCatalogForPrompt,
  groundTemplateDraft,
  detectExactExerciseListSlugs,
  detectRequiredExerciseSlugs,
  applyRequiredExercisesToTemplate,
  inferWorkingSetCount,
  isExplicitExerciseList,
  padExerciseSets,
  selectCatalogForAiPrompt,
  templateDraftSchema,
} from "./template-draft";

const sampleCatalog = [
  { slug: "squat", name: "Squat", category: "legs" as const },
  { slug: "bench", name: "Bench Press", category: "chest" as const },
  { slug: "pullup", name: "Pull-Up", category: "back" as const },
  {
    slug: "chest-fly-db",
    name: "Chest Fly (Dumbbell)",
    category: "chest" as const,
  },
];

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

  it("fills empty sets with three default working-set rows", () => {
    const { draft } = groundTemplateDraft(
      { name: "Legs", exercises: [{ slug: "squat", sets: [] }] },
      allowed,
    );
    expect(draft.exercises[0]?.sets).toEqual([
      { weight: 0, reps: 0 },
      { weight: 0, reps: 0 },
      { weight: 0, reps: 0 },
    ]);
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

  it("keeps prompt-named lifts even when the cap would be filled by priority slugs", () => {
    const selected = selectCatalogForAiPrompt({
      prompt: "hip thrust and pendlay row",
      max: 42,
    });
    const slugs = selected.map((e) => e.slug);
    expect(slugs).toContain("hip-thrust");
    expect(slugs).toContain("pendlay-row");
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

  it("omits category in compact form for the on-device token budget", () => {
    expect(
      formatCatalogForPrompt(
        [{ slug: "squat", name: "Squat", category: "legs" }],
        "compact",
      ),
    ).toBe("squat | Squat");
  });
});

describe("detectRequiredExerciseSlugs", () => {
  it("resolves a comma-and list of common lift names", () => {
    expect(
      detectRequiredExerciseSlugs(
        "do squat, bench, pull up, and fly",
        sampleCatalog,
      ),
    ).toEqual(["squat", "bench", "pullup", "chest-fly-db"]);
  });

  it("picks cable fly when the user says cable fly", () => {
    const catalog = [
      ...sampleCatalog,
      { slug: "cable-fly", name: "Cable Fly", category: "chest" as const },
    ];
    expect(detectRequiredExerciseSlugs("bench and cable fly", catalog)).toEqual(
      ["bench", "cable-fly"],
    );
  });

  it("resolves a 6-item comma list including short aliases", () => {
    const catalog = [
      ...sampleCatalog,
      { slug: "rdl", name: "Romanian Deadlift", category: "legs" as const },
      { slug: "ohp", name: "Overhead Press", category: "shoulders" as const },
      { slug: "barbell-row", name: "Barbell Row", category: "back" as const },
      { slug: "barbell-curl", name: "Barbell Curl", category: "arms" as const },
    ];
    expect(
      detectRequiredExerciseSlugs(
        "squat, bench, rdl, ohp, rows, curls",
        catalog,
      ),
    ).toEqual(["squat", "bench", "rdl", "ohp", "barbell-row", "barbell-curl"]);
  });

  it("resolves newline and numbered lists", () => {
    expect(
      detectRequiredExerciseSlugs(
        "1. squat\n2. bench\n3. pull up",
        sampleCatalog,
      ),
    ).toEqual(["squat", "bench", "pullup"]);
  });
});

describe("detectExactExerciseListSlugs", () => {
  it("resolves a list-only prompt for the deterministic fast path", () => {
    expect(
      detectExactExerciseListSlugs(
        "squat, bench, pull up, and fly",
        sampleCatalog,
      ),
    ).toEqual(["squat", "bench", "pullup", "chest-fly-db"]);
  });

  it("keeps required-plus-fill prompts on the semantic path", () => {
    expect(
      detectExactExerciseListSlugs(
        "make a push day with bench and fly",
        sampleCatalog,
      ),
    ).toBeNull();
  });

  it("refuses a fast path when any list item is unresolved", () => {
    expect(
      detectExactExerciseListSlugs(
        "squat, mystery lift, and bench",
        sampleCatalog,
      ),
    ).toBeNull();
  });
});

describe("applyRequiredExercisesToTemplate", () => {
  it("replaces the draft with the named list in strict mode", () => {
    const draft = applyRequiredExercisesToTemplate(
      {
        name: "Day",
        exercises: [
          { slug: "squat", sets: [{ weight: 0, reps: 5 }] },
          { slug: "bench", sets: [{ weight: 0, reps: 5 }] },
        ],
      },
      ["squat", "bench", "pullup", "chest-fly-db"],
      { strictList: true },
    );
    expect(draft.exercises.map((e) => e.slug)).toEqual([
      "squat",
      "bench",
      "pullup",
      "chest-fly-db",
    ]);
    expect(draft.exercises[2]?.sets).toHaveLength(3);
  });

  it("appends missing named lifts without strict mode", () => {
    const draft = applyRequiredExercisesToTemplate(
      {
        name: "Day",
        exercises: [{ slug: "squat", sets: [{ weight: 0, reps: 5 }] }],
      },
      ["squat", "bench"],
    );
    expect(draft.exercises.map((e) => e.slug)).toEqual(["squat", "bench"]);
  });
});

describe("isExplicitExerciseList", () => {
  it("treats comma lists and 3+ names as explicit", () => {
    expect(isExplicitExerciseList("squat, bench, fly", 3)).toBe(true);
    expect(isExplicitExerciseList("squat bench pullup fly", 4)).toBe(true);
    expect(isExplicitExerciseList("push day", 2)).toBe(false);
    expect(isExplicitExerciseList("1. squat\n2. bench", 2)).toBe(true);
  });
});

describe("inferWorkingSetCount / padExerciseSets", () => {
  it("defaults to 3 and expands a lone set row", () => {
    expect(inferWorkingSetCount("push day")).toBe(3);
    expect(
      padExerciseSets(
        [{ slug: "bench", sets: [{ weight: 135, reps: 8 }] }],
        "push day",
      )[0]?.sets,
    ).toEqual([
      { weight: 135, reps: 8 },
      { weight: 135, reps: 8 },
      { weight: 135, reps: 8 },
    ]);
  });

  it("uses a single NxM count from the prompt", () => {
    expect(inferWorkingSetCount("bench 4x8")).toBe(4);
    expect(
      padExerciseSets(
        [{ slug: "bench", sets: [{ weight: 0, reps: 8 }] }],
        "bench 4x8",
      )[0]?.sets,
    ).toHaveLength(4);
  });

  it("keeps a single set when the user asked for one", () => {
    expect(inferWorkingSetCount("1 set of deadlifts")).toBe(1);
    expect(
      padExerciseSets(
        [{ slug: "deadlift", sets: [{ weight: 0, reps: 5 }] }],
        "1 set of deadlifts",
      )[0]?.sets,
    ).toHaveLength(1);
  });
});
