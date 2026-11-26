import Foundation
import GrayedCore
import Testing
@testable import GrayedStore

final actor FakeSyncTransport: SyncTransport {
    var pushedRequests: [SyncPushRequest] = []
    var pullResponses: [Int64: SyncPullResponse] = [:]
    var nextPushError: Error?
    var nextSeq: Int64 = 1

    func setNextPushError(_ error: Error?) {
        self.nextPushError = error
    }

    func setPullResponse(_ response: SyncPullResponse, forCursor cursor: Int64) {
        pullResponses[cursor] = response
    }

    func push(_ request: SyncPushRequest) async throws -> SyncPushResponse {
        pushedRequests.append(request)
        if let error = nextPushError {
            throw error
        }
        let results = request.ops.map { op in
            defer { nextSeq += 1 }
            return SyncPushResult(
                opId: op.opId,
                aggregateType: op.aggregateType,
                aggregateId: op.aggregateId,
                status: .applied,
                version: op.baseVersion + 1,
                seq: nextSeq
            )
        }
        return SyncPushResponse(results: results)
    }

    func pull(cursor: Int64) async throws -> SyncPullResponse {
        pullResponses[cursor] ?? SyncPullResponse(cursor: cursor, items: [], hasMore: false)
    }
}

@Suite("Outbox account scoping and retry behavior")
struct OutboxAccountScopingTests {
    @Test("flush only selects and drains outbox entries for the signed-in account")
    func flushScopesByAccountId() async throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)
        let transport = FakeSyncTransport()
        let engine = SyncEngine(store: store, transport: transport)

        try store.saveWorkoutAggregate(
            SampleData.completedWorkout,
            accountId: SampleData.ownerId,
            opId: "op-alpha-1"
        )
        let betaPlace = Place(
            id: "place-beta",
            ownerId: SampleData.otherOwnerId,
            name: "Beta Gym",
            isDefault: true,
            createdAt: 2_000,
            updatedAt: 2_000
        )
        try store.savePlace(betaPlace, accountId: SampleData.otherOwnerId, opId: "op-beta-1")

        // Flush only account-alpha
        let summary = try await engine.flushOutbox(accountId: SampleData.ownerId)
        #expect(summary.attemptedCount == 1)
        #expect(summary.acknowledgedCount == 1)

        let requests = await transport.pushedRequests
        #expect(requests.count == 1)
        #expect(requests[0].ops.map(\.opId) == ["op-alpha-1"])

        // account-alpha outbox is now empty; account-beta outbox is completely untouched
        #expect(try store.fetchPendingOutbox(accountId: SampleData.ownerId).isEmpty)
        let betaPending = try store.fetchPendingOutbox(accountId: SampleData.otherOwnerId)
        #expect(betaPending.map(\.opId) == ["op-beta-1"])
    }

    @Test("expired session (unauthorized) pauses flush without dropping or penalizing outbox")
    func unauthorizedLeavesOutboxIntact() async throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)
        let transport = FakeSyncTransport()
        await transport.setNextPushError(SyncTransportError.unauthorized)
        let engine = SyncEngine(store: store, transport: transport)

        try store.savePlace(SampleData.homeGym, accountId: SampleData.ownerId, opId: "op-p1")

        await #expect(throws: SyncTransportError.unauthorized) {
            _ = try await engine.flushOutbox(accountId: SampleData.ownerId)
        }

        let pending = try store.fetchPendingOutbox(accountId: SampleData.ownerId)
        #expect(pending.count == 1)
        #expect(pending[0].attempts == 0)
        #expect(pending[0].lastError == nil)
    }

    @Test("transient HTTP error increments attempts and records lastError without deleting outbox")
    func transientErrorRecordsAttempts() async throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)
        let transport = FakeSyncTransport()
        await transport.setNextPushError(SyncTransportError.httpError(statusCode: 503, body: "overloaded"))
        let engine = SyncEngine(store: store, transport: transport)

        try store.savePlace(SampleData.homeGym, accountId: SampleData.ownerId, opId: "op-p1")

        await #expect(throws: SyncTransportError.httpError(statusCode: 503, body: "overloaded")) {
            _ = try await engine.flushOutbox(accountId: SampleData.ownerId)
        }

        let pending = try store.fetchPendingOutbox(accountId: SampleData.ownerId)
        #expect(pending.count == 1)
        #expect(pending[0].attempts == 1)
        #expect(pending[0].lastError?.contains("503") == true)
    }

    @Test("successful push updates local serverVersion for subsequent edits")
    func pushAdvancesBaseVersion() async throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)
        let transport = FakeSyncTransport()
        let engine = SyncEngine(store: store, transport: transport)

        try store.savePlace(SampleData.homeGym, accountId: SampleData.ownerId, opId: "op-v0")
        _ = try await engine.flushOutbox(accountId: SampleData.ownerId)

        var renamed = SampleData.homeGym
        renamed.name = "Home Garage Gym"
        renamed.updatedAt += 1_000
        let nextEntry = try store.savePlace(renamed, accountId: SampleData.ownerId, opId: "op-v1")
        #expect(nextEntry.baseVersion == 1)
    }
}
