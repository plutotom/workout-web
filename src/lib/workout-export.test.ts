import { describe, expect, it } from "vitest";

import { buildCatalog } from "./exercises";
import {
  CODE_PREFIX,
  bundleFileName,
  convertWeight,
  describeBundle,
  encodeBundleCode,
  parseBundle,
  serializeBundle,
  summarizeBundle,
  toBundle,
  type TemplateExportData,
  type WorkoutExportBundle,
} from "./workout-export";

const EXPORTED_AT = Date.UTC(2026, 2, 14, 12, 0, 0);

const data: TemplateExportData = {
  unit: "lb",
  templates: [
    {
      name: "Push Day",
      exercises: [
        {
          slug: "bench",
          sets: [
            { weight: 185, reps: 5 },
            { weight: 205, reps: 3 },
          ],
          notes: "Pause on the chest",
        },
        { slug: "custom:abc123", sets: [{ weight: 60, reps: 12 }] },
      ],
    },
  ],
  customExercises: [
    {
      slug: "custom:abc123",
      name: "Cable Fly (Low)",
      category: "chest",
      usesBar: false,
    },
  ],
};

function makeBundle(): WorkoutExportBundle {
  // The portable format deliberately omits `archived` — that's the sender's
  // local state, not part of the lift's definition.
  const catalog = buildCatalog(
    data.customExercises.map((entry) => ({ ...entry, archived: false })),
  );
  return toBundle(data, catalog, { exportedAt: EXPORTED_AT });
}

describe("toBundle", () => {
  it("attaches catalog display names so unknown slugs stay readable", () => {
    const bundle = makeBundle();
    const [curated, custom] = bundle.templates[0]!.exercises;
    expect(curated!.name).toBe("Bench Press (Barbell)");
    expect(custom!.name).toBe("Cable Fly (Low)");
  });

  it("carries definitions for referenced custom lifts", () => {
    expect(makeBundle().customExercises).toEqual(data.customExercises);
  });

  it("keeps notes but omits the key when absent", () => {
    const [curated, custom] = makeBundle().templates[0]!.exercises;
    expect(curated!.notes).toBe("Pause on the chest");
    expect(custom).not.toHaveProperty("notes");
  });
});

describe("round trips", () => {
  it("survives the pasted-code transport", () => {
    const bundle = makeBundle();
    const code = encodeBundleCode(bundle);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);

    const result = parseBundle(code);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle).toEqual(bundle);
  });

  it("survives the .json file transport", () => {
    const bundle = makeBundle();
    const result = parseBundle(serializeBundle(bundle));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle).toEqual(bundle);
  });

  it("handles non-ASCII names through base64", () => {
    const bundle = makeBundle();
    bundle.templates[0]!.name = "Björn's Push — 💪";
    const result = parseBundle(encodeBundleCode(bundle));
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.bundle.templates[0]!.name).toBe("Björn's Push — 💪");
  });

  it("tolerates surrounding whitespace from a sloppy copy/paste", () => {
    const code = `\n  ${encodeBundleCode(makeBundle())}  \n`;
    expect(parseBundle(code).ok).toBe(true);
  });
});

describe("code encoding", () => {
  // Round-tripping only proves the encoder agrees with itself. These check it
  // agrees with the rest of the world, since the base64 is hand-rolled to avoid
  // depending on btoa/Buffer/TextEncoder across four runtimes.
  it("emits standard unpadded base64url", () => {
    const code = encodeBundleCode(makeBundle());
    const payload = code.slice(CODE_PREFIX.length);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(payload, "base64url").toString("utf8")).toBe(
      JSON.stringify(makeBundle()),
    );
  });

  it("decodes what an independent encoder produced", () => {
    const bundle = makeBundle();
    const foreign =
      CODE_PREFIX +
      Buffer.from(JSON.stringify(bundle), "utf8").toString("base64url");
    const result = parseBundle(foreign);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle).toEqual(bundle);
  });

  it.each(["a", "ab", "abc", "abcd", "é", "💪", "Björn — 💪 ünïcode"])(
    "matches Buffer for every input length remainder: %s",
    (name) => {
      const bundle = makeBundle();
      bundle.templates[0]!.name = name;
      const payload = encodeBundleCode(bundle).slice(CODE_PREFIX.length);
      expect(payload).toBe(
        Buffer.from(JSON.stringify(bundle), "utf8").toString("base64url"),
      );
    },
  );
});

describe("parseBundle rejections", () => {
  it("rejects empty input", () => {
    expect(parseBundle("   ")).toMatchObject({ ok: false });
  });

  it("rejects arbitrary JSON", () => {
    expect(parseBundle('{"hello":"world"}')).toMatchObject({
      ok: false,
      error: "That file isn't a workout export",
    });
  });

  it("rejects unparseable text", () => {
    expect(parseBundle("not json at all")).toMatchObject({ ok: false });
  });

  it("rejects a truncated code with an actionable message", () => {
    const code = encodeBundleCode(makeBundle());
    const result = parseBundle(code.slice(0, code.length - 30));
    expect(result.ok).toBe(false);
  });

  it("explains a future format version rather than failing silently", () => {
    const bundle = { ...makeBundle(), version: 99 };
    const result = parseBundle(JSON.stringify(bundle));
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("newer version");
  });

  it("rejects a bundle with no templates", () => {
    const bundle = { ...makeBundle(), templates: [] };
    expect(parseBundle(JSON.stringify(bundle))).toMatchObject({ ok: false });
  });

  it("rejects a malformed set", () => {
    const bundle = makeBundle();
    // @ts-expect-error deliberately corrupt input
    bundle.templates[0].exercises[0].sets[0].weight = "heavy";
    expect(parseBundle(JSON.stringify(bundle))).toMatchObject({ ok: false });
  });

  it("rejects a custom exercise with an unknown muscle group", () => {
    const bundle = makeBundle();
    // @ts-expect-error deliberately corrupt input
    bundle.customExercises[0].category = "elbows";
    expect(parseBundle(JSON.stringify(bundle))).toMatchObject({ ok: false });
  });

  it("falls back to the slug when an exercise name is missing", () => {
    const bundle = makeBundle();
    // @ts-expect-error deliberately corrupt input
    delete bundle.templates[0].exercises[0].name;
    const result = parseBundle(JSON.stringify(bundle));
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.bundle.templates[0]!.exercises[0]!.name).toBe("bench");
  });
});

describe("summaries", () => {
  it("counts templates, exercises and sets", () => {
    expect(summarizeBundle(makeBundle())).toEqual({
      templateCount: 1,
      exerciseCount: 2,
      setCount: 3,
      customCount: 1,
      unit: "lb",
    });
  });

  it("describes a bundle in plain language", () => {
    expect(describeBundle(makeBundle())).toBe(
      "1 template · 2 exercises · 3 sets",
    );
  });
});

describe("bundleFileName", () => {
  it("uses the template name for a single-template export", () => {
    expect(bundleFileName(makeBundle())).toBe("push-day-2026-03-14.json");
  });

  it("falls back to a generic name for a multi-template export", () => {
    const bundle = makeBundle();
    bundle.templates.push({ name: "Pull Day", exercises: [] });
    expect(bundleFileName(bundle)).toBe("workouts-2026-03-14.json");
  });

  it("survives a name with no alphanumerics", () => {
    const bundle = makeBundle();
    bundle.templates[0]!.name = "!!!";
    expect(bundleFileName(bundle)).toBe("workout-2026-03-14.json");
  });
});

function expectConvexSafe(bundle: WorkoutExportBundle) {
  expect(Object.keys(bundle).sort()).toEqual(
    [
      "customExercises",
      "exportedAt",
      "format",
      "templates",
      "unit",
      "version",
    ].sort(),
  );
  for (const template of bundle.templates) {
    expect(Object.keys(template).sort()).toEqual(["exercises", "name"].sort());
    for (const exercise of template.exercises) {
      for (const key of Object.keys(exercise)) {
        expect(["name", "notes", "sets", "slug"]).toContain(key);
      }
      for (const set of exercise.sets) {
        expect(Object.keys(set).sort()).toEqual(["reps", "weight"].sort());
      }
    }
  }
  for (const custom of bundle.customExercises) {
    for (const key of Object.keys(custom)) {
      expect(["category", "name", "short", "slug", "usesBar"]).toContain(key);
    }
  }
}

describe("cross-client compatibility", () => {
  it("strips iOS-only extras a local row might leak into the JSON", () => {
    const noisy = {
      ...makeBundle(),
      templates: [
        {
          ...makeBundle().templates[0]!,
          id: "local-template-1",
          updatedAt: 1,
        },
      ],
      customExercises: [
        {
          ...makeBundle().customExercises[0]!,
          _id: "row-1",
          archived: false,
          updatedAt: 99,
        },
      ],
    };
    const result = parseBundle(JSON.stringify(noisy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConvexSafe(result.bundle);
    expect(result.bundle.templates[0]).not.toHaveProperty("id");
    expect(result.bundle.customExercises[0]).not.toHaveProperty("archived");
  });

  it("imports an older v1 file that's missing names, customExercises, and version", () => {
    const older = {
      format: "workout.export",
      unit: "kg",
      templates: [
        {
          name: "Legs",
          exercises: [
            { slug: "squat", sets: [{ weight: 100, reps: 5 }] },
            {
              slug: "custom:local-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
              name: "Hack Squat Machine",
              sets: [{ weight: 80, reps: 8 }],
            },
          ],
        },
      ],
    };
    const result = parseBundle(JSON.stringify(older));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConvexSafe(result.bundle);
    expect(result.bundle.version).toBe(1);
    expect(result.bundle.templates[0]!.exercises[0]!.name).toBe("squat");
    expect(result.bundle.customExercises).toEqual([]);
  });

  it("accepts a UTF-8 BOM that some browsers prepend on download", () => {
    const json = serializeBundle(makeBundle());
    expect(parseBundle(`\uFEFF${json}`).ok).toBe(true);
  });

  it("does not leak undefined short onto custom lifts — Convex rejects extras", () => {
    const catalog = buildCatalog();
    const bundle = toBundle(
      {
        unit: "lb",
        templates: [
          {
            name: "Push",
            exercises: [{ slug: "bench", sets: [{ weight: 135, reps: 5 }] }],
          },
        ],
        customExercises: [
          {
            slug: "custom:x",
            name: "Fly",
            short: undefined,
            category: "chest",
            usesBar: false,
          },
        ],
      },
      catalog,
      { exportedAt: EXPORTED_AT },
    );
    expect(bundle.customExercises[0]).not.toHaveProperty("short");
    expectConvexSafe(bundle);
  });
});

describe("convertWeight", () => {
  it("keeps 0 as 0 and converts kg to lb", () => {
    expect(convertWeight(0, "kg", "lb")).toBe(0);
    expect(convertWeight(100, "kg", "lb")).toBe(220);
    expect(convertWeight(225, "lb", "kg")).toBe(102);
  });
});
