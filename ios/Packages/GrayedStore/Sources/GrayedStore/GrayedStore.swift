import Foundation
import GRDB
import GrayedCore

public enum StoreError: Error, Sendable, Equatable {
    case invalidAggregate(String)
}

/// Local-first GRDB repository enforcing atomic aggregate + outbox writes.
///
/// Every local write that syncs commits the aggregate/row AND its `outbox` entry
/// in one SQLite transaction. Built-in exercises (`source == .builtin` / `builtin:*`)
/// never enter the outbox.
public final class GrayedStore: Sendable {
    public let database: DatabaseManager

    public init(database: DatabaseManager) {
        self.database = database
    }

    // MARK: - Workout Aggregate

    /// Saves a full workout aggregate (workout + exercises + sets) and enqueues its outbox
    /// entry in a single transaction.
    @discardableResult
    public func saveWorkoutAggregate(
        _ aggregate: WorkoutAggregate,
        accountId: String,
        opId: String = UUID().uuidString,
        baseVersion: Int? = nil,
        createdAt: Int64 = GrayedStore.nowMilliseconds()
    ) throws -> OutboxEntry {
        try saveWorkoutAggregate(
            aggregate,
            accountId: accountId,
            opId: opId,
            baseVersion: baseVersion,
            createdAt: createdAt,
            beforeOutboxCommit: nil
        )
    }

    /// Internal test hook allowing mid-transaction failure injection to verify atomicity.
    @discardableResult
    func saveWorkoutAggregate(
        _ aggregate: WorkoutAggregate,
        accountId: String,
        opId: String = UUID().uuidString,
        baseVersion: Int? = nil,
        createdAt: Int64 = GrayedStore.nowMilliseconds(),
        beforeOutboxCommit: ((Database) throws -> Void)?
    ) throws -> OutboxEntry {
        try database.writer.write { db in
            let existingVersion = try Int.fetchOne(
                db,
                sql: "SELECT serverVersion FROM workout WHERE id = ?",
                arguments: [aggregate.workout.id]
            ) ?? 0
            let effectiveBaseVersion = baseVersion ?? existingVersion

            try Self.upsertWorkoutAggregate(aggregate, serverVersion: existingVersion, in: db)

            if let hook = beforeOutboxCommit {
                try hook(db)
            }

            let payload = try Self.encodeJSON(aggregate)
            let entry = OutboxEntry(
                opId: opId,
                accountId: accountId,
                aggregateType: .workout,
                aggregateId: aggregate.workout.id,
                payload: payload,
                baseVersion: effectiveBaseVersion,
                createdAt: createdAt
            )
            try entry.insert(db)
            return entry
        }
    }

    public func fetchWorkoutAggregate(id: String) throws -> WorkoutAggregate? {
        try database.reader.read { db in
            guard let workoutRecord = try WorkoutRecord.fetchOne(db, key: id) else {
                return nil
            }
            return try Self.hydrateWorkoutAggregate(workoutRecord, in: db)
        }
    }

    public func fetchWorkouts(ownerId: String, includeDeleted: Bool = false) throws -> [WorkoutAggregate] {
        try database.reader.read { db in
            let sql = includeDeleted
                ? "SELECT * FROM workout WHERE ownerId = ? ORDER BY startedAt DESC"
                : "SELECT * FROM workout WHERE ownerId = ? AND deletedAt IS NULL ORDER BY startedAt DESC"
            let records = try WorkoutRecord.fetchAll(db, sql: sql, arguments: [ownerId])
            return try records.map { try Self.hydrateWorkoutAggregate($0, in: db) }
        }
    }

    public func fetchActiveWorkout(ownerId: String) throws -> WorkoutAggregate? {
        try database.reader.read { db in
            guard let record = try WorkoutRecord.fetchOne(
                db,
                sql: "SELECT * FROM workout WHERE ownerId = ? AND status = 'active' AND deletedAt IS NULL LIMIT 1",
                arguments: [ownerId]
            ) else {
                return nil
            }
            return try Self.hydrateWorkoutAggregate(record, in: db)
        }
    }

    public func workoutCount(ownerId: String? = nil) throws -> Int {
        try database.reader.read { db in
            if let ownerId {
                return try Int.fetchOne(
                    db,
                    sql: "SELECT COUNT(*) FROM workout WHERE ownerId = ? AND deletedAt IS NULL",
                    arguments: [ownerId]
                ) ?? 0
            }
            return try Int.fetchOne(
                db,
                sql: "SELECT COUNT(*) FROM workout WHERE deletedAt IS NULL"
            ) ?? 0
        }
    }

    // MARK: - Template Aggregate

    /// Saves a full template aggregate (template + exercises) and enqueues its outbox
    /// entry in a single transaction.
    @discardableResult
    public func saveTemplateAggregate(
        _ aggregate: TemplateAggregate,
        accountId: String,
        opId: String = UUID().uuidString,
        baseVersion: Int? = nil,
        createdAt: Int64 = GrayedStore.nowMilliseconds()
    ) throws -> OutboxEntry {
        try saveTemplateAggregate(
            aggregate,
            accountId: accountId,
            opId: opId,
            baseVersion: baseVersion,
            createdAt: createdAt,
            beforeOutboxCommit: nil
        )
    }

    @discardableResult
    func saveTemplateAggregate(
        _ aggregate: TemplateAggregate,
        accountId: String,
        opId: String = UUID().uuidString,
        baseVersion: Int? = nil,
        createdAt: Int64 = GrayedStore.nowMilliseconds(),
        beforeOutboxCommit: ((Database) throws -> Void)?
    ) throws -> OutboxEntry {
        try database.writer.write { db in
            let existingVersion = try Int.fetchOne(
                db,
                sql: "SELECT serverVersion FROM template WHERE id = ?",
                arguments: [aggregate.template.id]
            ) ?? 0
            let effectiveBaseVersion = baseVersion ?? existingVersion

            try Self.upsertTemplateAggregate(aggregate, serverVersion: existingVersion, in: db)

            if let hook = beforeOutboxCommit {
                try hook(db)
            }

            let payload = try Self.encodeJSON(aggregate)
            let entry = OutboxEntry(
                opId: opId,
                accountId: accountId,
                aggregateType: .template,
                aggregateId: aggregate.template.id,
                payload: payload,
                baseVersion: effectiveBaseVersion,
                createdAt: createdAt
            )
            try entry.insert(db)
            return entry
        }
    }

    public func fetchTemplateAggregate(id: String) throws -> TemplateAggregate? {
        try database.reader.read { db in
            guard let record = try TemplateRecord.fetchOne(db, key: id) else {
                return nil
            }
            return try Self.hydrateTemplateAggregate(record, in: db)
        }
    }

    public func fetchTemplates(ownerId: String, includeDeleted: Bool = false) throws -> [TemplateAggregate] {
        try database.reader.read { db in
            let sql = includeDeleted
                ? "SELECT * FROM template WHERE ownerId = ? ORDER BY updatedAt DESC"
                : "SELECT * FROM template WHERE ownerId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC"
            let records = try TemplateRecord.fetchAll(db, sql: sql, arguments: [ownerId])
            return try records.map { try Self.hydrateTemplateAggregate($0, in: db) }
        }
    }

    // MARK: - Per-Row Synced Entities

    /// Saves an exercise. Built-in exercises (`source == .builtin` / `builtin:*`) are stored locally
    /// and never enqueued into the outbox.
    @discardableResult
    public func saveExercise(
        _ exercise: Exercise,
        accountId: String,
        opId: String = UUID().uuidString,
        baseVersion: Int? = nil,
        createdAt: Int64 = GrayedStore.nowMilliseconds()
    ) throws -> OutboxEntry? {
        try database.writer.write { db in
            let existingVersion = try Int.fetchOne(
                db,
                sql: "SELECT serverVersion FROM exercise WHERE id = ?",
                arguments: [exercise.id]
            ) ?? 0
            let record = try ExerciseRecord(from: exercise, serverVersion: existingVersion)
            try record.save(db)

            guard !exercise.isBuiltIn else { return nil }

            let entry = OutboxEntry(
                opId: opId,
                accountId: accountId,
                aggregateType: .exercise,
                aggregateId: exercise.id,
                payload: try Self.encodeJSON(exercise),
                baseVersion: baseVersion ?? existingVersion,
                createdAt: createdAt
            )
            try entry.insert(db)
            return entry
        }
    }

    public func fetchExercise(id: String) throws -> Exercise? {
        try database.reader.read { db in
            try ExerciseRecord.fetchOne(db, key: id)?.toModel()
        }
    }

    @discardableResult
    public func savePlace(
        _ place: Place,
        accountId: String,
        opId: String = UUID().uuidString,
        baseVersion: Int? = nil,
        createdAt: Int64 = GrayedStore.nowMilliseconds()
    ) throws -> OutboxEntry {
        try database.writer.write { db in
            let existingVersion = try Int.fetchOne(
                db,
                sql: "SELECT serverVersion FROM place WHERE id = ?",
                arguments: [place.id]
            ) ?? 0
            let record = PlaceRecord(from: place, serverVersion: existingVersion)
            try record.save(db)

            let entry = OutboxEntry(
                opId: opId,
                accountId: accountId,
                aggregateType: .place,
                aggregateId: place.id,
                payload: try Self.encodeJSON(place),
                baseVersion: baseVersion ?? existingVersion,
                createdAt: createdAt
            )
            try entry.insert(db)
            return entry
        }
    }

    public func fetchPlace(id: String) throws -> Place? {
        try database.reader.read { db in
            try PlaceRecord.fetchOne(db, key: id)?.toModel()
        }
    }

    @discardableResult
    public func saveMachine(
        _ machine: Machine,
        accountId: String,
        opId: String = UUID().uuidString,
        baseVersion: Int? = nil,
        createdAt: Int64 = GrayedStore.nowMilliseconds()
    ) throws -> OutboxEntry {
        try database.writer.write { db in
            let existingVersion = try Int.fetchOne(
                db,
                sql: "SELECT serverVersion FROM machine WHERE id = ?",
                arguments: [machine.id]
            ) ?? 0
            let record = MachineRecord(from: machine, serverVersion: existingVersion)
            try record.save(db)

            let entry = OutboxEntry(
                opId: opId,
                accountId: accountId,
                aggregateType: .machine,
                aggregateId: machine.id,
                payload: try Self.encodeJSON(machine),
                baseVersion: baseVersion ?? existingVersion,
                createdAt: createdAt
            )
            try entry.insert(db)
            return entry
        }
    }

    public func fetchMachine(id: String) throws -> Machine? {
        try database.reader.read { db in
            try MachineRecord.fetchOne(db, key: id)?.toModel()
        }
    }

    @discardableResult
    public func saveSettings(
        _ settings: UserSettings,
        accountId: String,
        opId: String = UUID().uuidString,
        baseVersion: Int? = nil,
        createdAt: Int64 = GrayedStore.nowMilliseconds()
    ) throws -> OutboxEntry {
        try database.writer.write { db in
            let existingVersion = try Int.fetchOne(
                db,
                sql: "SELECT serverVersion FROM settings WHERE ownerId = ?",
                arguments: [settings.ownerId]
            ) ?? 0
            let record = SettingsRecord(from: settings, serverVersion: existingVersion)
            try record.save(db)

            let entry = OutboxEntry(
                opId: opId,
                accountId: accountId,
                aggregateType: .settings,
                aggregateId: settings.ownerId,
                payload: try Self.encodeJSON(settings),
                baseVersion: baseVersion ?? existingVersion,
                createdAt: createdAt
            )
            try entry.insert(db)
            return entry
        }
    }

    public func fetchSettings(ownerId: String) throws -> UserSettings? {
        try database.reader.read { db in
            try SettingsRecord.fetchOne(db, key: ownerId)?.toModel()
        }
    }

    // MARK: - Outbox & Sync State Reads

    public func fetchPendingOutbox(accountId: String) throws -> [OutboxEntry] {
        try database.reader.read { db in
            try OutboxEntry.fetchAll(
                db,
                sql: "SELECT * FROM outbox WHERE accountId = ? ORDER BY createdAt ASC, rowid ASC",
                arguments: [accountId]
            )
        }
    }

    public func fetchAllOutbox() throws -> [OutboxEntry] {
        try database.reader.read { db in
            try OutboxEntry.fetchAll(db, sql: "SELECT * FROM outbox ORDER BY createdAt ASC, rowid ASC")
        }
    }

    public func fetchSyncState(accountId: String) throws -> SyncStateRecord {
        try database.reader.read { db in
            try SyncStateRecord.fetchOne(db, key: accountId)
                ?? SyncStateRecord(accountId: accountId, pullCursor: 0, lastPullAt: nil)
        }
    }

    // MARK: - Internal Aggregate Upsert Helpers (shared with PullApplier)

    static func upsertWorkoutAggregate(_ aggregate: WorkoutAggregate, serverVersion: Int, in db: Database) throws {
        let workoutRecord = WorkoutRecord(from: aggregate.workout, serverVersion: serverVersion)
        try workoutRecord.save(db)

        // Replace child exercises and sets cleanly so removed exercises/sets don't linger.
        try db.execute(
            sql: "DELETE FROM workout_exercise WHERE workoutId = ?",
            arguments: [aggregate.workout.id]
        )
        for exAgg in aggregate.exercises {
            guard exAgg.exercise.workoutId == aggregate.workout.id else {
                throw StoreError.invalidAggregate("workout_exercise.workoutId mismatch")
            }
            try WorkoutExerciseRecord(from: exAgg.exercise).save(db)
            for set in exAgg.sets {
                guard set.workoutExerciseId == exAgg.exercise.id else {
                    throw StoreError.invalidAggregate("workout_set.workoutExerciseId mismatch")
                }
                try WorkoutSetRecord(from: set).save(db)
            }
        }
    }

    static func upsertTemplateAggregate(_ aggregate: TemplateAggregate, serverVersion: Int, in db: Database) throws {
        let templateRecord = TemplateRecord(from: aggregate.template, serverVersion: serverVersion)
        try templateRecord.save(db)

        try db.execute(
            sql: "DELETE FROM template_exercise WHERE templateId = ?",
            arguments: [aggregate.template.id]
        )
        for ex in aggregate.exercises {
            guard ex.templateId == aggregate.template.id else {
                throw StoreError.invalidAggregate("template_exercise.templateId mismatch")
            }
            try TemplateExerciseRecord(from: ex).save(db)
        }
    }

    private static func hydrateWorkoutAggregate(_ workoutRecord: WorkoutRecord, in db: Database) throws -> WorkoutAggregate {
        let exerciseRecords = try WorkoutExerciseRecord.fetchAll(
            db,
            sql: "SELECT * FROM workout_exercise WHERE workoutId = ? ORDER BY position ASC",
            arguments: [workoutRecord.id]
        )
        let exercises: [WorkoutExerciseAggregate] = try exerciseRecords.map { exRecord in
            let sets = try WorkoutSetRecord.fetchAll(
                db,
                sql: "SELECT * FROM workout_set WHERE workoutExerciseId = ? ORDER BY position ASC",
                arguments: [exRecord.id]
            )
            return WorkoutExerciseAggregate(
                exercise: exRecord.toModel(),
                sets: sets.map { $0.toModel() }
            )
        }
        return WorkoutAggregate(workout: workoutRecord.toModel(), exercises: exercises)
    }

    private static func hydrateTemplateAggregate(_ templateRecord: TemplateRecord, in db: Database) throws -> TemplateAggregate {
        let exercises = try TemplateExerciseRecord.fetchAll(
            db,
            sql: "SELECT * FROM template_exercise WHERE templateId = ? ORDER BY position ASC",
            arguments: [templateRecord.id]
        )
        return TemplateAggregate(
            template: templateRecord.toModel(),
            exercises: exercises.map { $0.toModel() }
        )
    }

    static func encodeJSON<T: Encodable>(_ value: T) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(value)
        return String(decoding: data, as: UTF8.self)
    }

    public static func nowMilliseconds() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000.0)
    }
}
