/**
 * Frozen-file compatibility for export / import / restore.
 *
 * These fixtures are real on-disk payloads from older app versions. Do not
 * "fix" or modernize them. If a new field ships, add a *new* fixture rather
 * than editing an old one. `pnpm test:import-compat` runs on every commit.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validate } from "convex-helpers/validators";

import { portableBundleValidator } from "../../backend/schemas/portable";
import {
  bundleFromBackup,
  parseBackup,
  parseImportedFile,
} from "./workout-backup";
import { parseBundle, type WorkoutExportBundle } from "./workout-export";

const FIXTURES = join(import.meta.dirname, "fixtures/import-compat");

function fixture(name: string) {
  return readFileSync(join(FIXTURES, name), "utf8");
}

/**
 * The web/iOS importer sends this object straight to
 * `templates.mutations.importBundle`. If Convex would reject it, an old file
 * that parsed on the client still fails in production.
 */
function expectConvexImport(bundle: WorkoutExportBundle) {
  const ok = validate(portableBundleValidator, bundle, { throw: true });
  expect(ok).toBe(true);
}

describe("frozen import fixtures (must keep working)", () => {
  it("every fixture in the folder still parses, and imports pass Convex", () => {
    const names = readdirSync(FIXTURES).sort();
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const text = fixture(name).trim();
      if (name.endsWith(".wkt1.txt")) {
        const result = parseImportedFile(text);
        expect(result.ok, name).toBe(true);
        if (result.ok) expectConvexImport(result.bundle);
        continue;
      }
      if (!name.endsWith(".json")) {
        throw new Error(`Unexpected fixture ${name}`);
      }
      const parsed: unknown = JSON.parse(text);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "format" in parsed &&
        parsed.format === "workout.backup"
      ) {
        const backup = parseBackup(text);
        expect(backup.ok, name).toBe(true);
        const imported = parseImportedFile(text);
        expect(imported.ok, name).toBe(true);
        if (imported.ok) expectConvexImport(imported.bundle);
        continue;
      }
      const imported = parseImportedFile(text);
      expect(imported.ok, name).toBe(true);
      if (imported.ok) expectConvexImport(imported.bundle);
    }
  });

  it("restores the original iOS backup that predates places and Health", () => {
    const result = parseBackup(fixture("ios-backup-v1-original.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.templates).toHaveLength(1);
    expect(result.snapshot.templates[0]!.name).toBe("Push Day");
    expect(result.snapshot.templates[0]!.lastPlaceId).toBeNull();
    expect(result.snapshot.sessions).toHaveLength(1);
    expect(result.snapshot.sessions[0]!.placeId).toBeNull();
    expect(result.snapshot.sessions[0]!.placeName).toBeNull();
    expect(result.snapshot.sessions[0]!.exercises[0]!.machineId).toBeNull();
    expect(result.snapshot.places).toBeUndefined();
    expect(result.snapshot.machines).toBeUndefined();
    expect(result.snapshot.placeWeights).toBeUndefined();
    expect(result.snapshot.customExercises[0]!.name).toBe("Cable Fly (Low)");
  });

  it("imports templates out of that original iOS backup", () => {
    const result = parseImportedFile(fixture("ios-backup-v1-original.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConvexImport(result.bundle);
    expect(result.bundle.templates[0]!.name).toBe("Push Day");
    expect(result.bundle.templates[0]!.exercises).toHaveLength(2);
    expect(result.bundle.customExercises[0]!.slug).toBe(
      "custom:local-11111111-2222-3333-4444-555555555555",
    );
  });

  it("restores a web Export-all from before places existed", () => {
    const result = parseBackup(fixture("web-backup-v1-pre-places.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.sessions[0]!.remoteId).toBe("session-1");
    expect(result.snapshot.sessions[0]!.placeId).toBeNull();
    expect(result.snapshot.templates[0]!.lastPlaceId).toBeNull();
    expect(result.snapshot.places).toBeUndefined();
  });

  it("imports a portable .json template export from v1", () => {
    const result = parseImportedFile(fixture("portable-export-v1.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConvexImport(result.bundle);
    expect(result.bundle.version).toBe(1);
    expect(result.bundle.templates[0]!.exercises[0]!.name).toBe(
      "Bench Press (Barbell)",
    );
    expect(result.bundle.templates[0]!.exercises[0]!.notes).toBe(
      "Pause on the chest",
    );
    expect(result.bundle.customExercises).toHaveLength(1);
  });

  it("sends a well-formed v1 file to Convex without client rewriting", () => {
    const raw: unknown = JSON.parse(fixture("portable-export-v1.json"));
    expect(validate(portableBundleValidator, raw, { throw: true })).toBe(true);
  });

  it("imports a v1 portable export that omitted version", () => {
    const result = parseBundle(fixture("portable-export-v1-no-version.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.version).toBe(1);
    expectConvexImport(result.bundle);
  });

  it("imports a v1 file that omitted version, names, and customExercises", () => {
    const result = parseBundle(fixture("portable-export-v1-minimal.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.version).toBe(1);
    expect(result.bundle.customExercises).toEqual([]);
    expect(result.bundle.templates[0]!.exercises[0]!.name).toBe("bench");
    expectConvexImport(result.bundle);
  });

  it("decodes a frozen WKT1 code that was copied months ago", () => {
    const code = fixture("portable-export-v1.wkt1.txt").trim();
    expect(code.startsWith("WKT1-")).toBe(true);
    const result = parseImportedFile(code);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expectConvexImport(result.bundle);
    expect(result.bundle.templates[0]!.name).toBe("Push Day");
    expect(result.bundle.customExercises[0]!.name).toBe("Cable Fly (Low)");
  });

  it("turns the original iOS backup into a portable bundle the web importer accepts", () => {
    const backup = parseBackup(fixture("ios-backup-v1-original.json"));
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;
    const parsed = parseBundle(
      JSON.stringify(bundleFromBackup(backup.snapshot)),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expectConvexImport(parsed.bundle);
    expect(parsed.bundle.templates[0]!.name).toBe("Push Day");
  });
});
