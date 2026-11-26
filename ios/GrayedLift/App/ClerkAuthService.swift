import ClerkKit
import Foundation
import GrayedStore

enum AuthConfigurationState: Sendable, Equatable {
    case configured
    case unconfigured
}

/// Bridges ClerkKit to `GrayedStore.BearerTokenProvider`.
/// When `CLERK_PUBLISHABLE_KEY` is absent in `Secrets.xcconfig`, stays cleanly stubbed
/// so local GRDB storage remains fully usable offline.
final class ClerkAuthService: BearerTokenProvider, Sendable {
    let configurationState: AuthConfigurationState

    @MainActor
    init(config: AppConfig) {
        if let publishableKey = config.clerkPublishableKey {
            Clerk.configure(publishableKey: publishableKey)
            self.configurationState = .configured
        } else {
            self.configurationState = .unconfigured
        }
    }

    func bearerToken() async throws -> String? {
        guard configurationState == .configured else {
            return nil
        }
        return try await MainActor.run {
            Clerk.shared
        }.auth.getToken()
    }

    @MainActor
    var signedInAccountId: String? {
        guard configurationState == .configured else { return nil }
        return Clerk.shared.user?.id
    }
}
