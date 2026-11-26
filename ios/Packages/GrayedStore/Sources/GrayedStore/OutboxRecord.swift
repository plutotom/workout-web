import Foundation
import GRDB

public enum SyncAggregateType: String, Codable, Sendable, Hashable, CaseIterable {
    case workout
    case template
    case exercise
    case place
    case machine
    case settings
}

public struct OutboxEntry: Codable, FetchableRecord, PersistableRecord, Sendable, Equatable {
    public static let databaseTableName = "outbox"

    public var opId: String
    public var accountId: String
    public var aggregateType: SyncAggregateType
    public var aggregateId: String
    public var payload: String
    public var baseVersion: Int
    public var createdAt: Int64
    public var attempts: Int
    public var lastError: String?

    public init(
        opId: String,
        accountId: String,
        aggregateType: SyncAggregateType,
        aggregateId: String,
        payload: String,
        baseVersion: Int,
        createdAt: Int64,
        attempts: Int = 0,
        lastError: String? = nil
    ) {
        self.opId = opId
        self.accountId = accountId
        self.aggregateType = aggregateType
        self.aggregateId = aggregateId
        self.payload = payload
        self.baseVersion = baseVersion
        self.createdAt = createdAt
        self.attempts = attempts
        self.lastError = lastError
    }
}

public struct SyncStateRecord: Codable, FetchableRecord, PersistableRecord, Sendable, Equatable {
    public static let databaseTableName = "sync_state"

    public var accountId: String
    public var pullCursor: Int64
    public var lastPullAt: Int64?

    public init(accountId: String, pullCursor: Int64 = 0, lastPullAt: Int64? = nil) {
        self.accountId = accountId
        self.pullCursor = pullCursor
        self.lastPullAt = lastPullAt
    }
}
