import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var manager: WorkoutManager

  var body: some View {
    ScrollView {
      VStack(spacing: 10) {
        Text(manager.headline)
          .font(.headline)
          .multilineTextAlignment(.center)
        HStack {
          metric("HR", manager.heartRateLabel)
          metric("kcal", manager.energyLabel)
        }
        Text(manager.durationLabel)
          .font(.title2.monospacedDigit())
          .foregroundStyle(.secondary)
        if let error = manager.workoutError {
          Text(error).font(.footnote).foregroundStyle(.red)
            .multilineTextAlignment(.center)
          Button(manager.status == "saveFailed" ? "Retry Health update" : "Retry recovery", action: manager.retryWorkoutOperation)
          if manager.status == "saveFailed" {
            Button("Discard recording", role: .destructive, action: manager.discard)
          }
        } else if manager.status == "saving" || manager.status == "recovering" {
          ProgressView()
        } else if manager.isRecording {
          Button("End", role: .destructive, action: manager.endFromWatch)
        } else {
          Text("Start a lift on iPhone to record here.")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        if !manager.isRecording || manager.heartRate == nil || manager.activeEnergyKcal == nil {
          Text("Missing readings? In iPhone Health, open your profile → Apps → Grayed Lift and allow reading Heart Rate and Active Energy.")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
          Button(manager.requestingHealthAccess ? "Requesting…" : "Review Health access") {
            Task { await manager.reviewHealthAccess() }
          }
          .disabled(manager.requestingHealthAccess)
          Text("Previously declined access must be changed in Health settings.")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        if let error = manager.healthAccessError {
          Text(error)
            .font(.footnote)
            .foregroundStyle(.red)
            .multilineTextAlignment(.center)
        }
      }
      .padding()
    }
    // Request when the UI is visible, rather than silently swallowing errors
    // from an authorization sheet during applicationDidFinishLaunching.
    .task { await manager.reviewHealthAccess() }
  }

  private func metric(_ label: String, _ value: String) -> some View {
    VStack {
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text(value)
        .font(.title3.monospacedDigit())
    }
    .frame(maxWidth: .infinity)
  }
}

struct ContentView_Previews: PreviewProvider {
  static var previews: some View {
    ContentView().environmentObject(WorkoutManager.shared)
  }
}
