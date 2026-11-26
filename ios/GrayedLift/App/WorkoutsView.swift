import SwiftUI

struct WorkoutsView: View {
    @Environment(AppContainer.self) private var container

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                statusBanner

                if let error = container.startupError {
                    ContentUnavailableView(
                        "Local Store Error",
                        systemImage: "exclamationmark.triangle",
                        description: Text(error)
                    )
                } else {
                    ContentUnavailableView(
                        "No Workouts Yet",
                        systemImage: "dumbbell",
                        description: Text("Local database ready (\(container.workoutCount) workouts stored).")
                    )
                }
            }
            .navigationTitle("Workouts")
            .onAppear {
                container.refreshLocalCounts()
            }
        }
    }

    @ViewBuilder
    private var statusBanner: some View {
        if container.authService.configurationState == .unconfigured {
            HStack(spacing: 8) {
                Image(systemName: "icloud.slash")
                    .foregroundStyle(.secondary)
                Text("Offline mode — configure Clerk key in Secrets.xcconfig to enable sync.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
        } else if container.authService.signedInAccountId == nil {
            HStack(spacing: 8) {
                Image(systemName: "person.crop.circle.badge.exclamationmark")
                    .foregroundStyle(.secondary)
                Text("Sign in to sync — local data remains available offline.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(.ultraThinMaterial)
        }
    }
}
