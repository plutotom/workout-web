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

  private var requestingStart = false
  private var requestGeneration = UUID()

  /// Wake hints carry no authority. Only a fresh phone reply may admit a Start.
  func requestFreshStart() {
    let session = WCSession.default
    guard !requestingStart, session.activationState == .activated, session.isReachable else { return }
    requestingStart = true
    let generation = UUID()
    requestGeneration = generation
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
      if self.requestGeneration == generation { self.requestingStart = false }
    }
    var request = WorkoutManager.shared.startHandshakeContext
    request["type"] = "requestStart"
    request["protocolVersion"] = 2
    session.sendMessage(request, replyHandler: { reply in
      DispatchQueue.main.async {
        if self.requestGeneration == generation { self.requestingStart = false }
        guard reply["protocolVersion"] as? Int == 2 else { return }
        for command in reply["closures"] as? [[String: Any]] ?? [] { self.handle(command) }
        if let start = reply["start"] as? [String: Any],
           let expiresAt = start["expiresAt"] as? Double,
           expiresAt >= Date().timeIntervalSince1970 * 1000 {
          WorkoutManager.shared.startFromPhone(
            sessionId: start["sessionId"] as? String ?? "",
            startedAtMs: Date().timeIntervalSince1970 * 1000,
            syncIdentifier: start["syncIdentifier"] as? String ?? "",
            expiresAt: expiresAt)
        }
      }
    }, errorHandler: { _ in DispatchQueue.main.async {
      if self.requestGeneration == generation { self.requestingStart = false }
    } })
  }

  func send(_ payload: [String: Any]) {
    let mirrored = WorkoutManager.shared.sendMirrored(payload)
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    // Live samples have no value as a backlog. Durable state/results still use
    // WatchConnectivity alongside mirroring so background delivery can recover.
    if payload["type"] as? String == "metrics" {
      if !mirrored, session.isReachable { session.sendMessage(payload, replyHandler: nil, errorHandler: nil) }
      return
    }
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
  ) {
    DispatchQueue.main.async {
      WorkoutManager.shared.mirrorState()
      self.requestFreshStart()
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    if session.isReachable {
      DispatchQueue.main.async {
        WorkoutManager.shared.mirrorState()
        self.requestFreshStart()
      }
    }
  }

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

  func handle(_ message: [String: Any]) {
    if !Thread.isMainThread {
      DispatchQueue.main.async { self.handle(message) }
      return
    }
    switch message["type"] as? String {
    case "wake", "start":
      // Old contexts and queued Start packets are hints, never authorization.
      requestFreshStart()
    case "retry":
      guard let id = message["sessionId"] as? String, !id.isEmpty else { return }
      WorkoutManager.shared.retryFromPhone(sessionId: id)
    case "end":
      guard let id = message["sessionId"] as? String, !id.isEmpty else { return }
      WorkoutManager.shared.endFromPhone(sessionId: id, discard: false, endedAtMs: message["endedAt"] as? Double)
    case "discard":
      guard let id = message["sessionId"] as? String, !id.isEmpty else { return }
      WorkoutManager.shared.endFromPhone(sessionId: id, discard: true, endedAtMs: message["endedAt"] as? Double)
    case "status":
      WorkoutManager.shared.replyToStatus(sessionId: message["sessionId"] as? String)
    default: break
    }
  }
}
