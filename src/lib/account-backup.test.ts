import { describe, expect, it } from "vitest";

import { assembleAccountBackup } from "./account-backup";
import { BACKUP_FORMAT, BACKUP_VERSION, parseBackup } from "./workout-backup";

describe("assembleAccountBackup", () => {
  it("creates a web export the iOS backup parser accepts", () => {
    const snapshot = assembleAccountBackup(
      {
        createdAt: Date.UTC(2026, 7, 30),
        preferences: {
          unit: "lb",
          barWeightLb: 45,
          barWeightKg: 20,
          activeWorkoutMode: "list",
          restTimerEnabled: true,
          restTimerNotificationsEnabled: true,
          appleHealthImportNotificationsEnabled: false,
        },
        customExercises: [
          {
            id: "custom-1",
            remoteId: "custom-1",
            slug: "custom:custom-1",
            name: "My press",
            short: null,
            category: "chest",
            usesBar: false,
            archived: false,
            updatedAt: 1,
          },
        ],
        templates: [],
        exerciseNotes: [],
      },
      [
        {
          id: "session-1",
          remoteId: "session-1",
          templateId: null,
          remoteTemplateId: null,
          templateName: "Quick start",
          status: "completed",
          sessionKind: "tracked",
          startedAt: 10,
          completedAt: 20,
          updatedAt: 20,
          countsTowardGoals: true,
          externalProvider: null,
          externalId: null,
          activityType: null,
          sourceName: null,
          sourceBundleId: null,
          durationSeconds: null,
          energyKcal: null,
          distanceMeters: null,
          importedAt: null,
          exercises: [],
        },
      ],
    );

    expect(snapshot.format).toBe(BACKUP_FORMAT);
    expect(snapshot.version).toBe(BACKUP_VERSION);
    const parsed = parseBackup(JSON.stringify(snapshot));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.customExercises[0]!.remoteId).toBe("custom-1");
    expect(parsed.snapshot.sessions[0]!.remoteId).toBe("session-1");
  });
});
