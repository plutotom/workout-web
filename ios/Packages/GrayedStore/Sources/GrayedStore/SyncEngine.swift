import Foundation
import GRDB
import GrayedCore

public enum PullApplier {
    /// Applies pulled server aggregates/tombstones and advances `sync_state.pullCursor`
    /// atomically in one transaction. Idempotent on replay.
    public static func apply(
        response: SyncPullResponse,
        accountId: String,
        in database: DatabaseManager,
        now: Int64 = GrayedStore.nowMilliseconds()
    ) throws {
        try database.writer.write { db in
            for item in response.items {
                try applyItem(item, in: db)
            }

            let existing = try SyncStateRecord.fetchOne(db, key: accountId)
            let nextCursor = max(existing?.pullCursor ?? 0, response.cursor)
            let nextState = SyncStateRecord(
                accountId: accountId,
                pullCursor: nextCursor,
                lastPullAt: now
            )
            try nextState.save(db)
        }
    }

    private static func applyItem(_ item: SyncPullItem, in db: Database) throws {
        switch item.aggregateType {
        case .workout:
            var aggregate = try item.doc.decode(WorkoutAggregate.self)
            if let deletedAt = item.deletedAt, aggregate.workout.deletedAt == nil {
                aggregate.workout.deletedAt = deletedAt
            }
            try GrayedStore.upsertWorkoutAggregate(aggregate, serverVersion: item.version, in: db)

        case .template:
            var aggregate = try item.doc.decode(TemplateAggregate.self)
            if let deletedAt = item.deletedAt, aggregate.template.deletedAt == nil {
                aggregate.template.deletedAt = deletedAt
            }
            try GrayedStore.upsertTemplateAggregate(aggregate, serverVersion: item.version, in: db)

        case .exercise:
            var exercise = try item.doc.decode(Exercise.self)
            if let deletedAt = item.deletedAt, exercise.deletedAt == nil {
                exercise.deletedAt = deletedAt
            }
            try ExerciseRecord(from: exercise, serverVersion: item.version).save(db)

        case .place:
            var place = try item.doc.decode(Place.self)
            if let deletedAt = item.deletedAt, place.deletedAt == nil {
                place.deletedAt = deletedAt
            }
            try PlaceRecord(from: place, serverVersion: item.version).save(db)

        case .machine:
            var machine = try item.doc.decode(Machine.self)
            if let deletedAt = item.deletedAt, machine.deletedAt == nil {
                machine.deletedAt = deletedAt
            }
            try MachineRecord(from: machine, serverVersion: item.version).save(db)

        case .settings:
            var settings = try item.doc.decode(UserSettings.self)
            if let deletedAt = item.deletedAt, settings.deletedAt == nil {
                settings.deletedAt = deletedAt
            }
            try SettingsRecord(from: settings, serverVersion: item.version).save(db)
        }
    }
}

public struct SyncFlushSummary: Sendable, Equatable {
    public var attemptedCount: Int
    public var acknowledgedCount: Int
    public var results: [SyncPushResult]

    public init(attemptedCount: Int, acknowledgedCount: Int, results: [SyncPushResult]) {
        self.attemptedCount = attemptedCount
        self.acknowledgedCount = acknowledgedCount
        self.results = results
    }
}

public struct SyncPullSummary: Sendable, Equatable {
    public var pagesFetched: Int
    public var itemsApplied: Int
    public var finalCursor: Int64

    public init(pagesFetched: Int, itemsApplied: Int, finalCursor: Int64) {
        self.pagesFetched = pagesFetched
        self.itemsApplied = itemsApplied
        self.finalCursor = finalCursor
    }
}

/// Coordinates account-scoped outbox flushing and pull application over `SyncTransport`.
public final class SyncEngine: Sendable {
    public let store: GrayedStore
    public let transport: any SyncTransport

    public init(store: GrayedStore, transport: any SyncTransport) {
        self.store = store
        self.transport = transport
    }

    /// Flushes only outbox entries belonging to `accountId`.
    /// Leaves entries for any other account untouched.
    public func flushOutbox(accountId: String) async throws -> SyncFlushSummary {
        let pending = try store.fetchPendingOutbox(accountId: accountId)
        guard !pending.isEmpty else {
            return SyncFlushSummary(attemptedCount: 0, acknowledgedCount: 0, results: [])
        }

        let ops = try pending.map { try Self.makePushOp(from: $0) }
        let response: SyncPushResponse
        do {
            response = try await transport.push(SyncPushRequest(ops: ops))
        } catch let error as SyncTransportError where error == .unauthenticated || error == .unauthorized {
            // Session expired / signed out: pause sync cleanly without mutating or dropping outbox rows.
            throw error
        } catch {
            try recordFailure(opIds: pending.map(\.opId), message: String(describing: error))
            throw error
        }

        let acknowledgedById = Dictionary(uniqueKeysWithValues: response.results.map { ($0.opId, $0) })

        try await store.database.writer.write { db in
            for entry in pending {
                guard let result = acknowledgedById[entry.opId] else { continue }
                try db.execute(
                    sql: "DELETE FROM outbox WHERE opId = ? AND accountId = ?",
                    arguments: [entry.opId, accountId]
                )
                if result.status == .applied || result.status == .duplicate {
                    try Self.updateServerVersion(
                        aggregateType: result.aggregateType,
                        aggregateId: result.aggregateId,
                        version: result.version,
                        in: db
                    )
                }
            }
        }

        return SyncFlushSummary(
            attemptedCount: pending.count,
            acknowledgedCount: response.results.count,
            results: response.results
        )
    }

    /// Pulls changes after the account's current `pullCursor` and applies them atomically.
    public func pull(accountId: String, maxPages: Int = 50) async throws -> SyncPullSummary {
        var pagesFetched = 0
        var itemsApplied = 0
        var cursor = try store.fetchSyncState(accountId: accountId).pullCursor

        while pagesFetched < maxPages {
            let response = try await transport.pull(cursor: cursor)
            try PullApplier.apply(response: response, accountId: accountId, in: store.database)

            pagesFetched += 1
            itemsApplied += response.items.count
            let nextCursor = max(cursor, response.cursor)
            let progressed = nextCursor > cursor
            cursor = nextCursor

            if !response.hasMore || !progressed {
                break
            }
        }

        return SyncPullSummary(
            pagesFetched: pagesFetched,
            itemsApplied: itemsApplied,
            finalCursor: cursor
        )
    }

    /// Standard sync cycle: push local pending ops, then pull server changes.
    public func sync(accountId: String) async throws -> (flush: SyncFlushSummary, pull: SyncPullSummary) {
        let flushSummary = try await flushOutbox(accountId: accountId)
        let pullSummary = try await pull(accountId: accountId)
        return (flushSummary, pullSummary)
    }

    private func recordFailure(opIds: [String], message: String) throws {
        try store.database.writer.write { db in
            for opId in opIds {
                try db.execute(
                    sql: "UPDATE outbox SET attempts = attempts + 1, lastError = ? WHERE opId = ?",
                    arguments: [message, opId]
                )
            }
        }
    }

    private static func makePushOp(from entry: OutboxEntry) throws -> SyncPushOp {
        let doc = try JSONDecoder().decode(JSONValue.self, from: Data(entry.payload.utf8))
        let (updatedAt, deletedAt) = extractTimestamps(aggregateType: entry.aggregateType, doc: doc, fallback: entry.createdAt)
        return SyncPushOp(
            opId: entry.opId,
            aggregateType: entry.aggregateType,
            aggregateId: entry.aggregateId,
            baseVersion: entry.baseVersion,
            updatedAt: updatedAt,
            deletedAt: deletedAt,
            doc: doc
        )
    }

    private static func extractTimestamps(
        aggregateType: SyncAggregateType,
        doc: JSONValue,
        fallback: Int64
    ) -> (updatedAt: Int64, deletedAt: Int64?) {
        guard case let .object(root) = doc else {
            return (fallback, nil)
        }
        let targetObject: [String: JSONValue]
        switch aggregateType {
        case .workout:
            if case let .object(workout) = root["workout"] {
                targetObject = workout
            } else {
                targetObject = root
            }
        case .template:
            if case let .object(template) = root["template"] {
                targetObject = template
            } else {
                targetObject = root
            }
        case .exercise, .place, .machine, .settings:
            targetObject = root
        }

        let updatedAt: Int64
        if case let .integer(value) = targetObject["updatedAt"] {
            updatedAt = value
        } else {
            updatedAt = fallback
        }

        let deletedAt: Int64?
        if case let .integer(value) = targetObject["deletedAt"] {
            deletedAt = value
        } else {
            deletedAt = nil
        }

        return (updatedAt, deletedAt)
    }

    private static func updateServerVersion(
        aggregateType: SyncAggregateType,
        aggregateId: String,
        version: Int,
        in db: Database
    ) throws {
        switch aggregateType {
        case .workout:
            try db.execute(sql: "UPDATE workout SET serverVersion = ? WHERE id = ?", arguments: [version, aggregateId])
        case .template:
            try db.execute(sql: "UPDATE template SET serverVersion = ? WHERE id = ?", arguments: [version, aggregateId])
        case .exercise:
            try db.execute(sql: "UPDATE exercise SET serverVersion = ? WHERE id = ?", arguments: [version, aggregateId])
        case .place:
            try db.execute(sql: "UPDATE place SET serverVersion = ? WHERE id = ?", arguments: [version, aggregateId])
        case .machine:
            try db.execute(sql: "UPDATE machine SET serverVersion = ? WHERE id = ?", arguments: [version, aggregateId])
        case .settings:
            try db.execute(sql: "UPDATE settings SET serverVersion = ? WHERE ownerId = ?", arguments: [version, aggregateId])
        }
    }
}
