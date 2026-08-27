import ExpoModulesCore
import HealthKit
import WatchConnectivity

public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")
    Events("onWatchEvent")

    OnCreate {
      WatchPhoneSession.shared.activate { payload in
        self.sendEvent("onWatchEvent", payload)
      }
    }

    Function("getStatus") { () -> [String: Any] in
      WatchPhoneSession.shared.status()
    }

    AsyncFunction("startWatchWorkout") { (sessionId: String, startedAt: Double, syncIdentifier: String) in
      do {
        try await WatchPhoneSession.shared.startWatchWorkout(
          sessionId: sessionId,
          startedAt: startedAt,
          syncIdentifier: syncIdentifier
        )
      } catch let error as Exception {
        throw error
      } catch {
        throw Exception(
          name: "WatchLaunchFailed",
          description: WatchPhoneSession.launchFailureMessage(error)
        )
      }
    }

    AsyncFunction("endWatchWorkout") {
      WatchPhoneSession.shared.send(["type": "end"])
    }
    .runOnQueue(.main)

    AsyncFunction("discardWatchWorkout") {
      WatchPhoneSession.shared.send(["type": "discard"])
    }
    .runOnQueue(.main)
  }
}

final class WatchPhoneSession: NSObject, WCSessionDelegate {
  static let shared = WatchPhoneSession()
  var onEvent: (([String: Any]) -> Void)?
  private let healthStore = HKHealthStore()

  func activate(onEvent: @escaping ([String: Any]) -> Void) {
    self.onEvent = onEvent
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func status() -> [String: Any] {
    guard WCSession.isSupported() else {
      return [
        "supported": false,
        "paired": false,
        "installed": false,
        "reachable": false,
      ]
    }
    let session = WCSession.default
    return [
      "supported": true,
      "paired": session.isPaired,
      "installed": session.isWatchAppInstalled,
      "reachable": session.isReachable,
    ]
  }

  @MainActor
  func startWatchWorkout(
    sessionId: String,
    startedAt: Double,
    syncIdentifier: String
  ) async throws {
    let workoutType = HKObjectType.workoutType()
    try await healthStore.requestAuthorization(toShare: [workoutType], read: [workoutType])

    guard WCSession.isSupported() else {
      throw Exception(name: "WatchUnavailable", description: "Watch recording needs an iPhone.")
    }
    let session = WCSession.default
    if !session.isPaired {
      throw Exception(name: "WatchNotPaired", description: "No paired Apple Watch.")
    }
    if !session.isWatchAppInstalled {
      throw Exception(
        name: "WatchAppNotInstalled",
        description: "Install Workout on Apple Watch from the Watch app on iPhone, then try again."
      )
    }

    let payload: [String: Any] = [
      "type": "start",
      "sessionId": sessionId,
      "startedAt": startedAt,
      "syncIdentifier": syncIdentifier,
    ]
    try? session.updateApplicationContext(payload)
    send(payload)

    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    do {
      try await healthStore.startWatchApp(toHandle: configuration)
    } catch {
      throw Exception(
        name: "WatchLaunchFailed",
        description: Self.launchFailureMessage(error)
      )
    }
    emit([
      "type": "state",
      "sessionId": sessionId,
      "status": "starting",
      "reachable": session.isReachable,
    ])
  }

  static func launchFailureMessage(_ error: Error) -> String {
    let text = error.localizedDescription.lowercased()
    if text.contains("not installed") {
      return "Install Workout on Apple Watch from the Watch app on iPhone, then try again."
    }
    if text.contains("authoriz") || text.contains("denied") {
      return "Allow Workout to write Apple Health workouts, then try again."
    }
    return "Couldn’t launch Workout on Apple Watch. Unlock the Watch, raise your wrist, and try Start Watch again."
  }

  func send(_ payload: [String: Any]) {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil) { _ in
        session.transferUserInfo(payload)
      }
    } else {
      session.transferUserInfo(payload)
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {}

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    emit([
      "type": "state",
      "sessionId": "",
      "status": session.isReachable ? "reachable" : "disconnected",
      "reachable": session.isReachable,
    ])
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    emit(message)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    emit(userInfo)
  }

  private func emit(_ payload: [String: Any]) {
    DispatchQueue.main.async {
      self.onEvent?(payload)
    }
  }
}
