import Foundation
import WatchConnectivity

final class PhoneBridge: NSObject, WCSessionDelegate {
  static let shared = PhoneBridge()

  func activate() {
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func latestStartContext() -> (
    sessionId: String,
    startedAt: Double,
    syncIdentifier: String
  ) {
    let context = WCSession.default.receivedApplicationContext
    return (
      sessionId: context["sessionId"] as? String ?? "",
      startedAt: context["startedAt"] as? Double ?? 0,
      syncIdentifier: context["syncIdentifier"] as? String ?? ""
    )
  }

  func send(_ payload: [String: Any]) {
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

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    handle(message)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    handle(userInfo)
  }

  func session(
    _ session: WCSession,
    didReceiveApplicationContext applicationContext: [String: Any]
  ) {
    handle(applicationContext)
  }

  private func handle(_ message: [String: Any]) {
    let type = message["type"] as? String
    DispatchQueue.main.async {
      switch type {
      case "start":
        WorkoutManager.shared.startFromPhone(
          sessionId: message["sessionId"] as? String ?? "",
          startedAtMs: message["startedAt"] as? Double ?? 0,
          syncIdentifier: message["syncIdentifier"] as? String ?? ""
        )
      case "end":
        WorkoutManager.shared.endFromWatch()
      case "discard":
        WorkoutManager.shared.discard()
      default:
        break
      }
    }
  }
}
