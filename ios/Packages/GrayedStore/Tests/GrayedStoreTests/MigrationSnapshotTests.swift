import Foundation
import GRDB
import GrayedCore
import Testing
@testable import GrayedStore

@Suite("Migration snapshot harness")
struct MigrationSnapshotTests {
    @Test("upgrades every committed snapshot fixture to current schema without losing data")
    func migratesAllSnapshots() throws {
        let fixturesDir = try #require(
            Bundle.module.url(forResource: "Fixtures", withExtension: nil),
            "Fixtures bundle directory must exist"
        )
        let contents = try FileManager.default.contentsOfDirectory(
            at: fixturesDir,
            includingPropertiesForKeys: nil
        )
        let snapshots = contents
            .filter { $0.pathExtension == "sqlite" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }

        #expect(!snapshots.isEmpty, "At least v1.sqlite snapshot must be committed in Fixtures/")

        for snapshotURL in snapshots {
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("migration-test-\(UUID().uuidString)-\(snapshotURL.lastPathComponent)")
            defer { try? FileManager.default.removeItem(at: tempURL) }

            try FileManager.default.copyItem(at: snapshotURL, to: tempURL)

            // Opening runs Migrations.migrator up to the latest schema version.
            let dbManager = try DatabaseManager.openQueue(atPath: tempURL.path)
            let store = GrayedStore(database: dbManager)

            // Verify SQLite integrity and foreign key constraints after migration.
            try dbManager.reader.read { db in
                let integrity = try String.fetchOne(db, sql: "PRAGMA integrity_check")
                #expect(integrity == "ok")

                let fkViolations = try Row.fetchAll(db, sql: "PRAGMA foreign_key_check")
                #expect(fkViolations.isEmpty)

                let applied = try Migrations.migrator.appliedMigrations(db)
                #expect(applied.contains(Migrations.v1Identifier))
            }

            // Assert representative v1 data survived the upgrade intact.
            let builtIn = try store.fetchExercise(id: SampleData.builtInBench.id)
            #expect(builtIn == SampleData.builtInBench)

            let custom = try store.fetchExercise(id: SampleData.customBeltSquat.id)
            #expect(custom == SampleData.customBeltSquat)

            let place = try store.fetchPlace(id: SampleData.homeGym.id)
            #expect(place == SampleData.homeGym)

            let machine = try store.fetchMachine(id: SampleData.cornerRack.id)
            #expect(machine == SampleData.cornerRack)

            let template = try store.fetchTemplateAggregate(id: SampleData.pushTemplate.template.id)
            #expect(template == SampleData.pushTemplate)

            let workout = try store.fetchWorkoutAggregate(id: SampleData.completedWorkout.workout.id)
            #expect(workout == SampleData.completedWorkout)

            let settings = try store.fetchSettings(ownerId: SampleData.ownerId)
            #expect(settings == SampleData.settings)

            let outbox = try store.fetchPendingOutbox(accountId: SampleData.ownerId)
            #expect(outbox.count == 6)

            let syncState = try store.fetchSyncState(accountId: SampleData.ownerId)
            #expect(syncState.pullCursor == 42)
            #expect(syncState.lastPullAt == 1_700_005_000_000)
        }
    }
}
