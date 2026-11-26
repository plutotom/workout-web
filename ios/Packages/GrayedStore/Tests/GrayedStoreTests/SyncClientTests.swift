import Foundation
import Testing
@testable import GrayedStore

private struct StaticTokenProvider: BearerTokenProvider {
    let token: String?
    func bearerToken() async throws -> String? { token }
}

private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

@Suite("URLSessionSyncTransport", .serialized)
struct SyncClientTests {
    private func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: config)
    }

    @Test("POST /sync/push sends bearer token and decodes results")
    func pushRequest() async throws {
        let baseURL = URL(string: "https://example.convex.site")!
        let transport = URLSessionSyncTransport(
            baseURL: baseURL,
            tokenProvider: StaticTokenProvider(token: "jwt-123"),
            session: makeSession()
        )

        StubURLProtocol.handler = { request in
            #expect(request.httpMethod == "POST")
            #expect(request.url?.absoluteString == "https://example.convex.site/sync/push")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer jwt-123")
            #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")

            let responsePayload = SyncPushResponse(results: [
                SyncPushResult(
                    opId: "op-1",
                    aggregateType: .place,
                    aggregateId: "p-1",
                    status: .applied,
                    version: 1,
                    seq: 1
                ),
            ])
            let data = try JSONEncoder().encode(responsePayload)
            let http = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (http, data)
        }

        let response = try await transport.push(
            SyncPushRequest(ops: [
                SyncPushOp(
                    opId: "op-1",
                    aggregateType: .place,
                    aggregateId: "p-1",
                    baseVersion: 0,
                    updatedAt: 1_000,
                    doc: .object(["id": .string("p-1")])
                ),
            ])
        )
        #expect(response.results.count == 1)
        #expect(response.results[0].status == .applied)
    }

    @Test("GET /sync/pull?cursor= sends cursor query and bearer token")
    func pullRequest() async throws {
        let baseURL = URL(string: "https://example.convex.site")!
        let transport = URLSessionSyncTransport(
            baseURL: baseURL,
            tokenProvider: StaticTokenProvider(token: "jwt-456"),
            session: makeSession()
        )

        StubURLProtocol.handler = { request in
            #expect(request.httpMethod == "GET")
            #expect(request.url?.absoluteString == "https://example.convex.site/sync/pull?cursor=42")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer jwt-456")

            let responsePayload = SyncPullResponse(cursor: 45, items: [], hasMore: false)
            let data = try JSONEncoder().encode(responsePayload)
            let http = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (http, data)
        }

        let response = try await transport.pull(cursor: 42)
        #expect(response.cursor == 45)
        #expect(response.hasMore == false)
    }

    @Test("missing token throws unauthenticated before network call")
    func missingTokenThrowsUnauthenticated() async {
        let baseURL = URL(string: "https://example.convex.site")!
        let transport = URLSessionSyncTransport(
            baseURL: baseURL,
            tokenProvider: StaticTokenProvider(token: nil),
            session: makeSession()
        )

        await #expect(throws: SyncTransportError.unauthenticated) {
            _ = try await transport.pull(cursor: 0)
        }
    }

    @Test("HTTP 401 maps to SyncTransportError.unauthorized")
    func http401MapsToUnauthorized() async {
        let baseURL = URL(string: "https://example.convex.site")!
        let transport = URLSessionSyncTransport(
            baseURL: baseURL,
            tokenProvider: StaticTokenProvider(token: "expired-jwt"),
            session: makeSession()
        )

        StubURLProtocol.handler = { request in
            let http = HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            return (http, Data())
        }

        await #expect(throws: SyncTransportError.unauthorized) {
            _ = try await transport.pull(cursor: 0)
        }
    }
}
