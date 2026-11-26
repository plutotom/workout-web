import Foundation

/// Type-safe Sendable JSON value used for sync envelopes (`doc`) without breaking Swift 6 concurrency.
public enum JSONValue: Codable, Sendable, Equatable {
    case null
    case bool(Bool)
    case integer(Int64)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let int = try? container.decode(Int64.self) {
            self = .integer(int)
        } else if let double = try? container.decode(Double.self) {
            self = .number(double)
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else if let object = try? container.decode([String: JSONValue].self) {
            self = .object(object)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported JSON value"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null:
            try container.encodeNil()
        case let .bool(v):
            try container.encode(v)
        case let .integer(v):
            try container.encode(v)
        case let .number(v):
            try container.encode(v)
        case let .string(v):
            try container.encode(v)
        case let .array(v):
            try container.encode(v)
        case let .object(v):
            try container.encode(v)
        }
    }

    public static func fromEncodable<T: Encodable>(_ value: T) throws -> JSONValue {
        let data = try JSONEncoder().encode(value)
        return try JSONDecoder().decode(JSONValue.self, from: data)
    }

    public func decode<T: Decodable>(_ type: T.Type) throws -> T {
        let data = try JSONEncoder().encode(self)
        return try JSONDecoder().decode(type, from: data)
    }
}

// MARK: - Sync Wire Contract

public struct SyncPushOp: Codable, Sendable, Equatable {
    public var opId: String
    public var aggregateType: SyncAggregateType
    public var aggregateId: String
    public var baseVersion: Int
    public var updatedAt: Int64
    public var deletedAt: Int64?
    public var doc: JSONValue

    public init(
        opId: String,
        aggregateType: SyncAggregateType,
        aggregateId: String,
        baseVersion: Int,
        updatedAt: Int64,
        deletedAt: Int64? = nil,
        doc: JSONValue
    ) {
        self.opId = opId
        self.aggregateType = aggregateType
        self.aggregateId = aggregateId
        self.baseVersion = baseVersion
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
        self.doc = doc
    }
}

public struct SyncPushRequest: Codable, Sendable, Equatable {
    public var ops: [SyncPushOp]

    public init(ops: [SyncPushOp]) {
        self.ops = ops
    }
}

public enum SyncPushOpStatus: String, Codable, Sendable, Equatable {
    case applied
    case duplicate
    case conflictServerWon = "conflict_server_won"
}

public struct SyncPushResult: Codable, Sendable, Equatable {
    public var opId: String
    public var aggregateType: SyncAggregateType
    public var aggregateId: String
    public var status: SyncPushOpStatus
    public var version: Int
    public var seq: Int64

    public init(
        opId: String,
        aggregateType: SyncAggregateType,
        aggregateId: String,
        status: SyncPushOpStatus,
        version: Int,
        seq: Int64
    ) {
        self.opId = opId
        self.aggregateType = aggregateType
        self.aggregateId = aggregateId
        self.status = status
        self.version = version
        self.seq = seq
    }
}

public struct SyncPushResponse: Codable, Sendable, Equatable {
    public var results: [SyncPushResult]

    public init(results: [SyncPushResult]) {
        self.results = results
    }
}

public struct SyncPullItem: Codable, Sendable, Equatable {
    public var aggregateType: SyncAggregateType
    public var aggregateId: String
    public var version: Int
    public var seq: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?
    public var doc: JSONValue

    public init(
        aggregateType: SyncAggregateType,
        aggregateId: String,
        version: Int,
        seq: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil,
        doc: JSONValue
    ) {
        self.aggregateType = aggregateType
        self.aggregateId = aggregateId
        self.version = version
        self.seq = seq
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
        self.doc = doc
    }
}

public struct SyncPullResponse: Codable, Sendable, Equatable {
    public var cursor: Int64
    public var items: [SyncPullItem]
    public var hasMore: Bool

    public init(cursor: Int64, items: [SyncPullItem], hasMore: Bool = false) {
        self.cursor = cursor
        self.items = items
        self.hasMore = hasMore
    }
}

// MARK: - Transport Protocol & Errors

public enum SyncTransportError: Error, Sendable, Equatable {
    case unauthenticated
    case unauthorized
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, body: String)
}

public protocol BearerTokenProvider: Sendable {
    func bearerToken() async throws -> String?
}

public protocol SyncTransport: Sendable {
    func push(_ request: SyncPushRequest) async throws -> SyncPushResponse
    func pull(cursor: Int64) async throws -> SyncPullResponse
}

// MARK: - URLSession Implementation

/// Plain HTTPS sync transport talking directly to Convex HTTP actions (`POST /sync/push`,
/// `GET /sync/pull?cursor=`). Does not depend on any Convex client SDK.
public final class URLSessionSyncTransport: SyncTransport, Sendable {
    public let baseURL: URL
    public let pushPath: String
    public let pullPath: String
    private let tokenProvider: any BearerTokenProvider
    private let session: URLSession

    public init(
        baseURL: URL,
        tokenProvider: any BearerTokenProvider,
        session: URLSession = .shared,
        pushPath: String = "sync/push",
        pullPath: String = "sync/pull"
    ) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.session = session
        self.pushPath = pushPath
        self.pullPath = pullPath
    }

    public func push(_ request: SyncPushRequest) async throws -> SyncPushResponse {
        let token = try await requireToken()
        let url = baseURL.appendingPathComponent(pushPath)
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        urlRequest.httpBody = try JSONEncoder().encode(request)

        let data = try await perform(urlRequest)
        return try JSONDecoder().decode(SyncPushResponse.self, from: data)
    }

    public func pull(cursor: Int64) async throws -> SyncPullResponse {
        let token = try await requireToken()
        var components = URLComponents(
            url: baseURL.appendingPathComponent(pullPath),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [URLQueryItem(name: "cursor", value: String(cursor))]
        guard let url = components?.url else {
            throw SyncTransportError.invalidURL
        }

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "GET"
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")

        let data = try await perform(urlRequest)
        return try JSONDecoder().decode(SyncPullResponse.self, from: data)
    }

    private func requireToken() async throws -> String {
        guard let token = try await tokenProvider.bearerToken(), !token.isEmpty else {
            throw SyncTransportError.unauthenticated
        }
        return token
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SyncTransportError.invalidResponse
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw SyncTransportError.unauthorized
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            let body = String(decoding: data, as: UTF8.self)
            throw SyncTransportError.httpError(statusCode: http.statusCode, body: body)
        }
        return data
    }
}
