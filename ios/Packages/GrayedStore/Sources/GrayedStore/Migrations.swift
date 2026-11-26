import Foundation
import GRDB

/// Append-only GRDB schema migrations for Grayed Lift.
///
/// ## Rules (enforced by tests)
/// 1. **Never edit a shipped migration.** Add a new named migration at the end of `migrator`.
/// 2. **Keep a snapshot database for every schema version** in
///    `Tests/GrayedStoreTests/Fixtures/v<N>.sqlite`.
///
/// ## How to add a new migration (`v<N>_<name>`)
/// 1. Append `migrator.registerMigration("v<N>_<short_name>") { db in ... }` below.
/// 2. Create a representative snapshot `.sqlite` file at schema version `N` (you can run
///    `SnapshotGenerator.generateSnapshot(at:)` in a test or temporary script right after
///    running migrations through `v<N>` and populating every new table/column).
/// 3. Commit `Tests/GrayedStoreTests/Fixtures/v<N>.sqlite` alongside the migration.
/// 4. Run `swift test` in `ios/Packages/GrayedStore` — `MigrationSnapshotTests` copies every
///    `Fixtures/*.sqlite` snapshot, migrates each to current, checks SQLite integrity and foreign
///    keys, and asserts all representative data survives.
public enum Migrations {
    public static let v1Identifier = "v1_initial"

    public static var migrator: DatabaseMigrator {
        var migrator = DatabaseMigrator()

        migrator.registerMigration(v1Identifier) { db in
            try db.create(table: "exercise") { t in
                t.primaryKey("id", .text).notNull()
                t.column("ownerId", .text).notNull()
                t.column("source", .text).notNull()
                t.column("name", .text).notNull()
                t.column("muscleGroups", .text).notNull()
                t.column("equipment", .text)
                t.column("usesBar", .boolean).notNull()
                t.column("loadType", .text).notNull()
                t.column("archivedAt", .integer)
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
                t.column("serverVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_exercise_owner", on: "exercise", columns: ["ownerId"])

            try db.create(table: "place") { t in
                t.primaryKey("id", .text).notNull()
                t.column("ownerId", .text).notNull()
                t.column("name", .text).notNull()
                t.column("isDefault", .boolean).notNull().defaults(to: false)
                t.column("archivedAt", .integer)
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
                t.column("serverVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_place_owner", on: "place", columns: ["ownerId"])

            try db.create(table: "machine") { t in
                t.primaryKey("id", .text).notNull()
                t.column("ownerId", .text).notNull()
                t.column("placeId", .text).notNull()
                t.column("name", .text).notNull()
                t.column("archivedAt", .integer)
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
                t.column("serverVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_machine_owner_place", on: "machine", columns: ["ownerId", "placeId"])

            try db.create(table: "template") { t in
                t.primaryKey("id", .text).notNull()
                t.column("ownerId", .text).notNull()
                t.column("name", .text).notNull()
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
                t.column("serverVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_template_owner", on: "template", columns: ["ownerId"])

            try db.create(table: "template_exercise") { t in
                t.primaryKey("id", .text).notNull()
                t.column("ownerId", .text).notNull()
                t.column("templateId", .text).notNull().references("template", onDelete: .cascade)
                t.column("position", .integer).notNull()
                t.column("exerciseId", .text).notNull()
                t.column("setCount", .integer).notNull()
                t.column("targetReps", .integer)
                t.column("presetWeight", .integer)
                t.column("presetUnit", .text)
                t.column("stickyNote", .text)
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
            }
            try db.create(index: "idx_template_exercise_template", on: "template_exercise", columns: ["templateId", "position"])

            try db.create(table: "workout") { t in
                t.primaryKey("id", .text).notNull()
                t.column("ownerId", .text).notNull()
                t.column("status", .text).notNull()
                t.column("startedAt", .integer).notNull()
                t.column("endedAt", .integer)
                t.column("placeId", .text)
                t.column("templateId", .text)
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
                t.column("serverVersion", .integer).notNull().defaults(to: 0)
            }
            try db.create(index: "idx_workout_owner_started", on: "workout", columns: ["ownerId", "startedAt"])
            try db.execute(
                sql: """
                CREATE UNIQUE INDEX idx_workout_one_active_per_owner
                ON workout(ownerId)
                WHERE status = 'active' AND deletedAt IS NULL
                """
            )

            try db.create(table: "workout_exercise") { t in
                t.primaryKey("id", .text).notNull()
                t.column("ownerId", .text).notNull()
                t.column("workoutId", .text).notNull().references("workout", onDelete: .cascade)
                t.column("position", .integer).notNull()
                t.column("exerciseId", .text).notNull()
                t.column("machineId", .text)
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
            }
            try db.create(index: "idx_workout_exercise_workout", on: "workout_exercise", columns: ["workoutId", "position"])

            try db.create(table: "workout_set") { t in
                t.primaryKey("id", .text).notNull()
                t.column("ownerId", .text).notNull()
                t.column("workoutExerciseId", .text).notNull().references("workout_exercise", onDelete: .cascade)
                t.column("position", .integer).notNull()
                t.column("weight", .integer).notNull()
                t.column("unit", .text).notNull()
                t.column("reps", .integer).notNull()
                t.column("completedAt", .integer)
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
            }
            try db.create(index: "idx_workout_set_exercise", on: "workout_set", columns: ["workoutExerciseId", "position"])

            try db.create(table: "settings") { t in
                t.primaryKey("ownerId", .text).notNull()
                t.column("defaultUnit", .text).notNull()
                t.column("barWeight", .integer).notNull()
                t.column("barUnit", .text).notNull()
                t.column("weeklyGoal", .integer).notNull()
                t.column("preferredView", .text).notNull()
                t.column("createdAt", .integer).notNull()
                t.column("updatedAt", .integer).notNull()
                t.column("deletedAt", .integer)
                t.column("serverVersion", .integer).notNull().defaults(to: 0)
            }

            // Local-only tables
            try db.create(table: "outbox") { t in
                t.primaryKey("opId", .text).notNull()
                t.column("accountId", .text).notNull()
                t.column("aggregateType", .text).notNull()
                t.column("aggregateId", .text).notNull()
                t.column("payload", .text).notNull()
                t.column("baseVersion", .integer).notNull()
                t.column("createdAt", .integer).notNull()
                t.column("attempts", .integer).notNull().defaults(to: 0)
                t.column("lastError", .text)
            }
            try db.create(index: "idx_outbox_account_created", on: "outbox", columns: ["accountId", "createdAt"])

            try db.create(table: "sync_state") { t in
                t.primaryKey("accountId", .text).notNull()
                t.column("pullCursor", .integer).notNull().defaults(to: 0)
                t.column("lastPullAt", .integer)
            }
        }

        return migrator
    }
}
