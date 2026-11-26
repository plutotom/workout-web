import Foundation
import GrayedCore
import GrayedStore
import Observation

@MainActor
@Observable
final class AppContainer {
    let config: AppConfig
    let authService: ClerkAuthService
    let database: DatabaseManager?
    let store: GrayedStore?
    let syncEngine: SyncEngine?
    private(set) var startupError: String?
    private(set) var workoutCount: Int = 0

    init(config: AppConfig = .load()) {
        self.config = config
        let auth = ClerkAuthService(config: config)
        self.authService = auth

        do {
            let dbURL = try DatabaseManager.defaultDatabaseURL()
            let dbManager = try DatabaseManager.open(atPath: dbURL.path)
            let localStore = GrayedStore(database: dbManager)
            self.database = dbManager
            self.store = localStore
            self.workoutCount = (try? localStore.workoutCount()) ?? 0

            if let baseURL = config.convexSiteURL {
                let transport = URLSessionSyncTransport(
                    baseURL: baseURL,
                    tokenProvider: auth
                )
                self.syncEngine = SyncEngine(store: localStore, transport: transport)
            } else {
                self.syncEngine = nil
            }
        } catch {
            self.database = nil
            self.store = nil
            self.syncEngine = nil
            self.startupError = error.localizedDescription
        }
    }

    func refreshLocalCounts() {
        guard let store else { return }
        workoutCount = (try? store.workoutCount()) ?? 0
    }
}
