import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { encodeBundleCode, parseBundle } from "./workout-export";
import {
  BACKUP_VERSION,
  bundleFromBackup,
  parseBackup,
  parseImportedFile,
  serializeBackup,
  type WorkoutBackupSnapshot,
} from "./workout-backup";

const CREATED_AT = Date.UTC(2026, 3, 2, 12, 0, 0);

/** Shape the first iOS backup version actually wrote — frozen in
 *  `fixtures/import-compat/`. Newer parsers must still accept this. */
type RawBackup = {
  customExercises: Array<Record<string, unknown>>;
  templates: Array<
    Record<string, unknown> & { exercises: Array<Record<string, unknown>> }
  >;
  sessions: Array<
    Record<string, unknown> & { exercises: Array<Record<string, unknown>> }
  >;
};

function originalIosBackup(): RawBackup {
  return JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "fixtures/import-compat/ios-backup-v1-original.json",
      ),
      "utf8",
    ),
  ) as RawBackup;
}

function currentBackup(): WorkoutBackupSnapshot {
  const parsed = parseBackup(JSON.stringify(originalIosBackup()));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.snapshot;
}

describe("older iOS backups", () => {
  it("accepts the original v1 snapshot that omitted later fields", () => {
    const result = parseBackup(JSON.stringify(originalIosBackup()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.version).toBe(BACKUP_VERSION);
    expect(result.snapshot.sessions[0]!.sessionKind).toBe("tracked");
    expect(result.snapshot.sessions[0]!.countsTowardGoals).toBe(true);
    expect(result.snapshot.sessions[0]!.externalProvider).toBeNull();
    expect(result.snapshot.preferences.restTimerNotificationsEnabled).toBe(
      true,
    );
    expect(
      result.snapshot.preferences.appleHealthImportNotificationsEnabled,
    ).toBe(false);
    expect(result.snapshot.customExercises[0]!.remoteId).toBeNull();
    expect(result.snapshot.templates[0]!.remoteId).toBeNull();
    expect(result.snapshot.sessions[0]!.remoteId).toBeNull();
    expect(result.snapshot.sessions[0]!.remoteTemplateId).toBeNull();
    expect(result.snapshot.sessions[0]!.placeId).toBeNull();
    expect(result.snapshot.places).toBeUndefined();
  });

  it("survives a UTF-8 BOM", () => {
    expect(parseBackup(`\uFEFF${JSON.stringify(originalIosBackup())}`).ok).toBe(
      true,
    );
  });

  it("rejects a future backup version with an actionable message", () => {
    const newer = { ...originalIosBackup(), version: 99 };
    const result = parseBackup(JSON.stringify(newer));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("newer version");
  });
});

describe("web Export all ↔ iOS backup", () => {
  it("turns an iOS backup into a portable bundle the web importer accepts", () => {
    const snapshot = currentBackup();
    const bundle = bundleFromBackup(snapshot);
    const parsed = parseBundle(JSON.stringify(bundle, null, 2));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.templates).toHaveLength(1);
    expect(parsed.bundle.templates[0]!.name).toBe("Push Day");
    expect(parsed.bundle.templates[0]!.exercises[0]!.notes).toBe(
      "Pause on the chest",
    );
    expect(parsed.bundle.customExercises).toEqual([
      {
        slug: "custom:local-11111111-2222-3333-4444-555555555555",
        name: "Cable Fly (Low)",
        category: "chest",
        usesBar: false,
      },
    ]);
  });

  it("lets parseImportedFile accept a web-style pretty JSON export", () => {
    const bundle = bundleFromBackup(currentBackup());
    const webFile = JSON.stringify(bundle, null, 2);
    const result = parseImportedFile(webFile);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bundle.templates[0]!.name).toBe("Push Day");
  });

  it("lets parseImportedFile accept an iOS backup as a template import", () => {
    const result = parseImportedFile(serializeBackup(currentBackup()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.unit).toBe("lb");
    expect(result.bundle.templates[0]!.exercises).toHaveLength(2);
  });

  it("lets parseImportedFile accept a WKT1 code the web app copied", () => {
    const code = encodeBundleCode(bundleFromBackup(currentBackup()));
    expect(parseImportedFile(code).ok).toBe(true);
  });

  it("round-trips a current backup through serialize/parse", () => {
    const snapshot = currentBackup();
    const result = parseBackup(serializeBackup(snapshot));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshot).toEqual(snapshot);
  });

  it("preserves server identities used by a web-to-iOS migration", () => {
    const original = originalIosBackup();
    const source = {
      ...original,
      customExercises: original.customExercises.map((exercise) => ({
        ...exercise,
        remoteId: "custom-convex-id",
      })),
      templates: original.templates.map((template) => ({
        ...template,
        remoteId: "template-convex-id",
      })),
      sessions: original.sessions.map((session) => ({
        ...session,
        remoteId: "session-convex-id",
        remoteTemplateId: "template-convex-id",
      })),
    };

    const result = parseBackup(JSON.stringify(source));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.customExercises[0]!.remoteId).toBe(
      "custom-convex-id",
    );
    expect(result.snapshot.templates[0]!.remoteId).toBe("template-convex-id");
    expect(result.snapshot.sessions[0]!.remoteId).toBe("session-convex-id");
    expect(result.snapshot.sessions[0]!.remoteTemplateId).toBe(
      "template-convex-id",
    );
  });

  it("treats malformed server identities as absent", () => {
    const original = originalIosBackup();
    const source = {
      ...original,
      templates: original.templates.map((template) => ({
        ...template,
        remoteId: "   ",
      })),
    };

    const result = parseBackup(JSON.stringify(source));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshot.templates[0]!.remoteId).toBeNull();
  });

  it("keeps optional place and machine fields from a newer snapshot", () => {
    const original = originalIosBackup();
    const source = {
      ...original,
      templates: original.templates.map((template) => ({
        ...template,
        lastPlaceId: "place-home",
      })),
      sessions: original.sessions.map((session) => ({
        ...session,
        placeId: "place-gym-b",
        placeName: "Gym B",
        exercises: session.exercises.map((exercise) => ({
          ...exercise,
          machineId: "machine-1",
          machineName: "Usual",
        })),
      })),
      places: [
        {
          id: "place-home",
          remoteId: "place-home",
          name: "Home",
          starred: true,
          archived: false,
          lastUsedAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
        {
          id: "place-gym-b",
          name: "Gym B",
          starred: false,
          archived: false,
          lastUsedAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
      ],
      machines: [
        {
          id: "machine-1",
          placeId: "place-gym-b",
          exerciseSlug: "bench",
          name: "Usual",
          isDefault: true,
          archived: false,
          lastUsedAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
      ],
      placeWeights: [
        {
          placeId: "place-gym-b",
          exerciseSlug: "bench",
          machineKey: "machine-1",
          sets: [{ weight: 300, reps: 8 }],
          updatedAt: CREATED_AT,
        },
      ],
    };

    const result = parseBackup(JSON.stringify(source));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.templates[0]!.lastPlaceId).toBe("place-home");
    expect(result.snapshot.sessions[0]!.placeName).toBe("Gym B");
    expect(result.snapshot.sessions[0]!.exercises[0]!.machineName).toBe(
      "Usual",
    );
    expect(result.snapshot.places).toHaveLength(2);
    expect(result.snapshot.machines?.[0]!.name).toBe("Usual");
    expect(result.snapshot.placeWeights?.[0]!.sets).toEqual([
      { weight: 300, reps: 8 },
    ]);
  });
});
