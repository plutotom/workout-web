import HealthKit
import SwiftUI
import WatchKit

@main
struct WorkoutWatchApp: App {
  @WKApplicationDelegateAdaptor(WatchAppDelegate.self) var appDelegate
  @StateObject private var manager = WorkoutManager.shared

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(manager)
    }
  }
}

final class WatchAppDelegate: NSObject, WKApplicationDelegate {
  func applicationDidFinishLaunching() {
    PhoneBridge.shared.activate()
    WorkoutManager.shared.prepare()
  }

  func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
    WorkoutManager.shared.handle(configuration: workoutConfiguration)
  }

  func handleActiveWorkoutRecovery() {
    WorkoutManager.shared.recoverIfNeeded()
  }
}
