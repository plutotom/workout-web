import ClerkKit
import SwiftUI

@main
struct GrayedLiftApp: App {
    @State private var container = AppContainer()

    var body: some Scene {
        WindowGroup {
            rootView
                .environment(container)
        }
    }

    @ViewBuilder
    private var rootView: some View {
        if container.authService.configurationState == .configured {
            WorkoutsView()
                .environment(Clerk.shared)
        } else {
            WorkoutsView()
        }
    }
}
