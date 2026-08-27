import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var manager: WorkoutManager

  var body: some View {
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
      if manager.isRecording {
        Button("End", role: .destructive, action: manager.endFromWatch)
      } else {
        Text("Start a lift on iPhone to record here.")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
    }
    .padding()
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
