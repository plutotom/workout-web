import Foundation

struct AppConfig: Sendable, Equatable {
    let clerkPublishableKey: String?
    let convexSiteURL: URL?

    var isClerkConfigured: Bool {
        clerkPublishableKey != nil
    }

    static func load(bundle: Bundle = .main) -> AppConfig {
        let rawKey = normalizedConfigValue(bundle.object(forInfoDictionaryKey: "CLERK_PUBLISHABLE_KEY") as? String)
        let rawHost = normalizedConfigValue(bundle.object(forInfoDictionaryKey: "CONVEX_SITE_HOST") as? String)

        let convexURL: URL?
        if let rawHost {
            if rawHost.hasPrefix("https://") || rawHost.hasPrefix("http://") {
                convexURL = URL(string: rawHost)
            } else {
                convexURL = URL(string: "https://\(rawHost)")
            }
        } else {
            convexURL = nil
        }

        return AppConfig(
            clerkPublishableKey: rawKey,
            convexSiteURL: convexURL
        )
    }

    private static func normalizedConfigValue(_ raw: String?) -> String? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty,
              !trimmed.hasPrefix("$("),
              !trimmed.contains("replace_me")
        else {
            return nil
        }
        return trimmed
    }
}
