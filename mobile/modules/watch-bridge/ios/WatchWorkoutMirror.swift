import Foundation
import HealthKit

/// HealthKit owns live reattachment. Every new mirrored object replaces the old
/// one, and application identity still travels in scoped protocol messages.
@available(iOS 17.0, *)
final class WatchWorkoutMirror: NSObject, HKWorkoutSessionDelegate {
  private var session: HKWorkoutSession?
  private let receive: ([String: Any]) -> Void

  init(healthStore: HKHealthStore, receive: @escaping ([String: Any]) -> Void) {
    self.receive = receive
    super.init()
    healthStore.workoutSessionMirroringStartHandler = { [weak self] session in
      DispatchQueue.main.async {
        guard let self else { return }
        self.session = session
        session.delegate = self
        self.send(["type": "status"])
      }
    }
  }

  func send(_ payload: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
    session?.sendToRemoteWorkoutSession(data: data) { _, _ in }
  }

  func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
    DispatchQueue.main.async {
      guard self.session === workoutSession else { return }
      for item in data {
        if let event = try? JSONSerialization.jsonObject(with: item) as? [String: Any] { self.receive(event) }
      }
    }
  }

  func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState,
                      from fromState: HKWorkoutSessionState, date: Date) {}
  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}
  func workoutSession(_ workoutSession: HKWorkoutSession, didDisconnectFromRemoteDeviceWithError error: Error?) {
    DispatchQueue.main.async {
      if self.session === workoutSession { self.session = nil }
    }
  }
}
