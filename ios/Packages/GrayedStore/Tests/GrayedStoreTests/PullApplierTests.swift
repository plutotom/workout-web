import Foundation
import GrayedCore
import Testing
@testable import GrayedStore

@Suite("PullApplier and end-to-end fake sync round-trip")
struct PullApplierTests {
    @Test("applies aggregates, tombstones, and advances pullCursor in one transaction; idempotent on replay")
    func pullAppliesAggregatesTombstonesAndIsIdempotent() async throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)
        let transport = FakeSyncTransport()
        let engine = SyncEngine(store: store, transport: transport)

        var deletedPlace = SampleData.homeGym
        deletedPlace.deletedAt = 1_700_009_000_000
        deletedPlace.updatedAt = 1_700_009_000_000

        let pullResponse = SyncPullResponse(
            cursor: 7,
            items: [
                SyncPullItem(
                    aggregateType: .workout,
                    aggregateId: SampleData.completedWorkout.workout.id,
                    version: 2,
                    seq: 5,
                    updatedAt: SampleData.completedWorkout.workout.updatedAt,
                    deletedAt: nil,
                    doc: try JSONValue.fromEncodable(SampleData.completedWorkout)
                ),
                SyncPullItem(
                    aggregateType: .template,
                    aggregateId: SampleData.pushTemplate.template.id,
                    version: 1,
                    seq: 6,
                    updatedAt: SampleData.pushTemplate.template.updatedAt,
                    deletedAt: nil,
                    doc: try JSONValue.fromEncodable(SampleData.pushTemplate)
                ),
                SyncPullItem(
                    aggregateType: .place,
                    aggregateId: deletedPlace.id,
                    version: 3,
                    seq: 7,
                    updatedAt: deletedPlace.updatedAt,
                    deletedAt: deletedPlace.deletedAt,
                    doc: try JSONValue.fromEncodable(deletedPlace)
                ),
            ],
            hasMore: false
        )

        await transport.setPullResponse(pullResponse, forCursor: 0)

        let summary = try await engine.pull(accountId: SampleData.ownerId)
        #expect(summary.pagesFetched == 1)
        #expect(summary.itemsApplied == 3)
        #expect(summary.finalCursor == 7)

        #expect(try store.fetchWorkoutAggregate(id: SampleData.completedWorkout.workout.id) == SampleData.completedWorkout)
        #expect(try store.fetchTemplateAggregate(id: SampleData.pushTemplate.template.id) == SampleData.pushTemplate)
        #expect(try store.fetchPlace(id: deletedPlace.id)?.deletedAt == 1_700_009_000_000)
        #expect(try store.fetchSyncState(accountId: SampleData.ownerId).pullCursor == 7)

        // Replay the exact same response: must be idempotent without duplicating child rows or regressing cursor.
        try PullApplier.apply(response: pullResponse, accountId: SampleData.ownerId, in: db, now: 1_700_010_000_000)
        #expect(try store.fetchWorkoutAggregate(id: SampleData.completedWorkout.workout.id) == SampleData.completedWorkout)
        #expect(try store.fetchTemplateAggregate(id: SampleData.pushTemplate.template.id) == SampleData.pushTemplate)
        #expect(try store.fetchSyncState(accountId: SampleData.ownerId).pullCursor == 7)
    }

    @Test("bad item inside pull response rolls back both earlier items and pullCursor")
    func pullAtomicityOnInvalidPayload() throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)

        let badResponse = SyncPullResponse(
            cursor: 10,
            items: [
                SyncPullItem(
                    aggregateType: .place,
                    aggregateId: SampleData.homeGym.id,
                    version: 1,
                    seq: 9,
                    updatedAt: SampleData.homeGym.updatedAt,
                    deletedAt: nil,
                    doc: try JSONValue.fromEncodable(SampleData.homeGym)
                ),
                SyncPullItem(
                    aggregateType: .workout,
                    aggregateId: "corrupt-wk",
                    version: 1,
                    seq: 10,
                    updatedAt: 1_000,
                    deletedAt: nil,
                    doc: .object(["broken": .bool(true)])
                ),
            ],
            hasMore: false
        )

        #expect(throws: Error.self) {
            try PullApplier.apply(response: badResponse, accountId: SampleData.ownerId, in: db)
        }

        // Neither the first place nor the cursor advance should have committed.
        #expect(try store.fetchPlace(id: SampleData.homeGym.id) == nil)
        #expect(try store.fetchSyncState(accountId: SampleData.ownerId).pullCursor == 0)
    }

    @Test("offline log -> reopen (force-quit) -> reconnect arrives once -> fresh install pulls back")
    func offlineForceQuitAndFreshInstallRoundTrip() async throws {
        let deviceAPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("device-a-\(UUID().uuidString).sqlite")
        let deviceBPath = FileManager.default.temporaryDirectory
            .appendingPathComponent("device-b-\(UUID().uuidString).sqlite")
        defer {
            try? FileManager.default.removeItem(at: deviceAPath)
            try? FileManager.default.removeItem(at: deviceBPath)
        }

        // 1. Device A logs a workout while completely offline.
        do {
            let dbA = try DatabaseManager.openQueue(atPath: deviceAPath.path)
            let storeA = GrayedStore(database: dbA)
            try storeA.saveWorkoutAggregate(
                SampleData.completedWorkout,
                accountId: SampleData.ownerId,
                opId: "op-offline-1"
            )
            #expect(try storeA.fetchPendingOutbox(accountId: SampleData.ownerId).count == 1)
        }

        // 2. Simulate force-quit and cold reopen on Device A; reconnect and push to fake server.
        let server = InMemorySyncServer()
        do {
            let dbAReopened = try DatabaseManager.openQueue(atPath: deviceAPath.path)
            let storeA = GrayedStore(database: dbAReopened)
            let engineA = SyncEngine(store: storeA, transport: server)

            let flush = try await engineA.flushOutbox(accountId: SampleData.ownerId)
            #expect(flush.acknowledgedCount == 1)
            #expect(try storeA.fetchPendingOutbox(accountId: SampleData.ownerId).isEmpty)

            // Re-pushing the exact same opId directly to the server deduplicates it.
            let dupResponse = try await server.push(
                SyncPushRequest(ops: [
                    SyncPushOp(
                        opId: "op-offline-1",
                        aggregateType: .workout,
                        aggregateId: SampleData.completedWorkout.workout.id,
                        baseVersion: 0,
                        updatedAt: SampleData.completedWorkout.workout.updatedAt,
                        doc: try JSONValue.fromEncodable(SampleData.completedWorkout)
                    ),
                ])
            )
            #expect(dupResponse.results.first?.status == .duplicate)
            #expect(await server.storedDocCount == 1)
        }

        // 3. Fresh install on Device B pulls everything back from cursor 0.
        do {
            let dbB = try DatabaseManager.openQueue(atPath: deviceBPath.path)
            let storeB = GrayedStore(database: dbB)
            let engineB = SyncEngine(store: storeB, transport: server)

            let pulled = try await engineB.pull(accountId: SampleData.ownerId)
            #expect(pulled.itemsApplied == 1)
            #expect(pulled.finalCursor == 1)

            let restored = try storeB.fetchWorkoutAggregate(id: SampleData.completedWorkout.workout.id)
            #expect(restored == SampleData.completedWorkout)
        }
    }
}

private actor InMemorySyncServer: SyncTransport {
    private var appliedOps: [String: SyncPushResult] = [:]
    private var docs: [String: SyncPullItem] = [:]
    private var seq: Int64 = 0

    var storedDocCount: Int { docs.count }

    func push(_ request: SyncPushRequest) async throws -> SyncPushResponse {
        var results: [SyncPushResult] = []
        for op in request.ops {
            if let existing = appliedOps[op.opId] {
                results.append(
                    SyncPushResult(
                        opId: op.opId,
                        aggregateType: existing.aggregateType,
                        aggregateId: existing.aggregateId,
                        status: .duplicate,
                        version: existing.version,
                        seq: existing.seq
                    )
                )
                continue
            }
            let key = "\(op.aggregateType.rawValue):\(op.aggregateId)"
            let current = docs[key]
            seq += 1
            let nextVersion = (current?.version ?? 0) + 1
            let item = SyncPullItem(
                aggregateType: op.aggregateType,
                aggregateId: op.aggregateId,
                version: nextVersion,
                seq: seq,
                updatedAt: op.updatedAt,
                deletedAt: op.deletedAt,
                doc: op.doc
            )
            docs[key] = item
            let result = SyncPushResult(
                opId: op.opId,
                aggregateType: op.aggregateType,
                aggregateId: op.aggregateId,
                status: .applied,
                version: nextVersion,
                seq: seq
            )
            appliedOps[op.opId] = result
            results.append(result)
        }
        return SyncPushResponse(results: results)
    }

    func pull(cursor: Int64) async throws -> SyncPullResponse {
        let items = docs.values
            .filter { $0.seq > cursor }
            .sorted { $0.seq < $1.seq }
        let nextCursor = items.last?.seq ?? cursor
        return SyncPullResponse(cursor: nextCursor, items: items, hasMore: false)
    }
}
