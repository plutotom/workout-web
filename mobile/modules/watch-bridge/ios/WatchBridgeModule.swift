import ExpoModulesCore
import HealthKit
import WatchConnectivity

public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")
    Events("onWatchEvent")

    OnCreate {
      WatchPhoneSession.shared.activate { [weak self] payload in
        self?.sendEvent("onWatchEvent", payload)
      }
    }

    OnDestroy {
      WatchPhoneSession.shared.clearEventSink()
    }

    Function("setAccountScope") { (scope: String, guestWorkoutIds: [String]) in
      DispatchQueue.main.async { WatchPhoneSession.shared.setAccountScope(scope, guestWorkoutIds: guestWorkoutIds) }
    }

    AsyncFunction("closeWatchSession") { (sessionId: String, endedAt: Double, discard: Bool, scope: String) in
      try WatchPhoneSession.shared.close(sessionId: sessionId, endedAt: endedAt, discard: discard, scope: scope)
    }

    Function("getStatus") { () -> [String: Any] in
      WatchPhoneSession.shared.status()
    }

    Function("getSessionEvents") { () -> [[String: Any]] in
      WatchPhoneSession.shared.sessionEvents()
    }

    Function("requestWatchStatus") {
      WatchPhoneSession.shared.requestStatus()
    }

    AsyncFunction("startWatchWorkout") { (sessionId: String, startedAt: Double, syncIdentifier: String) in
      do {
        try await WatchPhoneSession.shared.startWatchWorkout(
          sessionId: sessionId,
          startedAt: startedAt,
          syncIdentifier: syncIdentifier
        )
      } catch let error as Exception {
        WatchPhoneSession.shared.reportStartFailure(appId: sessionId)
        throw error
      } catch {
        WatchPhoneSession.shared.reportStartFailure(appId: sessionId)
        throw Exception(
          name: "WatchLaunchFailed",
          description: WatchPhoneSession.launchFailureMessage(error)
        )
      }
    }

    AsyncFunction("startWatchRecording") { (sessionId: String, syncIdentifier: String, scope: String) in
      do {
        try await WatchPhoneSession.shared.startWatchWorkout(sessionId: sessionId, startedAt: 0,
          syncIdentifier: syncIdentifier, expectedScope: scope)
      } catch {
        WatchPhoneSession.shared.reportStartFailure(appId: sessionId, scope: scope)
        throw error
      }
    }

    // Do not `.runOnQueue(.main)`: Finish/Discard is confirmed from a UIAlert,
    // and waiting on main while UIKit dismisses that alert deadlocks the JS
    // thread. The first tap then only reaches the Watch; a second tap is
    // needed to abandon the phone session. WCSession is thread-safe.
    AsyncFunction("endWatchWorkout") {
      WatchPhoneSession.shared.send(["type": "end"])
    }

    AsyncFunction("discardWatchWorkout") {
      WatchPhoneSession.shared.send(["type": "discard"])
    }

    AsyncFunction("endWatchSession") { (sessionId: String) in
      try WatchPhoneSession.shared.sendCommand(["type": "end", "sessionId": sessionId])
    }

    AsyncFunction("retryWatchSession") { (sessionId: String) in
      try WatchPhoneSession.shared.sendCommand(["type": "retry", "sessionId": sessionId])
    }

    AsyncFunction("discardWatchSession") { (sessionId: String) in
      try WatchPhoneSession.shared.sendCommand(["type": "discard", "sessionId": sessionId])
    }
  }
}

final class WatchPhoneSession: NSObject, WCSessionDelegate {
  static let shared = WatchPhoneSession()
  var onEvent: (([String: Any]) -> Void)?
  private let healthStore = HKHealthStore()
  let snapshots = WatchSessionSnapshotCache()
  let journal = WatchRecordingJournal(fileURL: FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("WatchRecording/attempts-v2.json"))
  private let scopeLock = NSLock()
  private var storedScope: String?
  private var accountScope: String? {
    get { scopeLock.lock(); defer { scopeLock.unlock() }; return storedScope }
    set { scopeLock.lock(); defer { scopeLock.unlock() }; storedScope = newValue }
  }
  private var configured = false
  private var mirror: AnyObject?

  func bootstrap() {
    guard !configured else { return }
    configured = true
    if #available(iOS 17.0, *) {
      mirror = WatchWorkoutMirror(healthStore: healthStore) { [weak self] payload in self?.receive(payload) }
    }
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  func setAccountScope(_ scope: String, guestWorkoutIds: [String]) {
    // A cold background launch cannot authorize a new recording until the
    // authenticated/local provider supplies its current scope.
    do { try journal.adoptGuestWorkouts(guestWorkoutIds, scope: scope) }
    catch { accountScope = nil; return }
    accountScope = scope
    resolveExpiredOffers()
    try? journal.retireOtherScopes(scope, now: Date().timeIntervalSince1970 * 1000)
    for payload in journal.closurePayloads() { send(payload) }
    for event in sessionEvents() { onEvent?(event) }
  }

  func close(sessionId: String, endedAt: Double, discard: Bool, scope: String) throws {
    let legacy = ["starting", "recording", "recovering", "recoveryFailed", "saving", "saveFailed"].contains(snapshots.status(for: sessionId) ?? "")
    let payloads = try journal.close(appId: sessionId, discard: discard, endedAt: endedAt, scope: scope, allowLegacy: legacy)
    DispatchQueue.main.async { for payload in payloads { self.send(payload) } }
  }

  func reportStartFailure(appId: String, scope: String? = nil) {
    DispatchQueue.main.async {
      let owner = scope ?? self.accountScope ?? ""
      if let id = self.journal.attempt(appId: appId, scope: owner) {
        let safe = (try? self.journal.launchFailed(id)) ?? false
        self.emit(["type": "state", "sessionId": id, "status": safe ? "idle" : "recovering", "reachable": false])
      } else {
        self.emit(["type": "state", "sessionId": appId, "status": self.journal.isReadable ? "idle" : "recoveryFailed", "accountScope": owner, "reachable": false])
      }
    }
  }

  func activate(onEvent: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async {
      self.onEvent = onEvent
      self.bootstrap()
    }
  }

  func requestStatus() {
    resolveExpiredOffers()
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    // Status queries must not enqueue stale work or launch a workout.
    guard session.activationState == .activated, session.isReachable else { return }
    for payload in journal.closurePayloads() { send(payload) }
    let ids = journal.pendingIds()
    for id in ids.isEmpty ? [snapshots.latestSessionId() ?? ""] : ids {
      session.sendMessage(["type": "status", "sessionId": id], replyHandler: nil, errorHandler: nil)
    }
  }

  func clearEventSink() {
    DispatchQueue.main.async {
      self.onEvent = nil
      self.accountScope = nil
    }
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
    syncIdentifier: String,
    expectedScope: String? = nil
  ) async throws {
    let workoutType = HKObjectType.workoutType()
    // Request the full current read set on every start. HealthKit only presents
    // undecided types, including metrics added after an older workout-only grant.
    let readTypes: Set<HKObjectType> = [
      workoutType,
      HKQuantityType.quantityType(forIdentifier: .heartRate)!,
      HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
    ]
    try await healthStore.requestAuthorization(toShare: [workoutType], read: readTypes)

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

    guard let scope = accountScope, expectedScope == nil || scope == expectedScope, !sessionId.isEmpty else {
      throw Exception(name: "WatchUnavailable", description: "Open your workout on iPhone before starting Watch recording.")
    }
    let attempt = try journal.offer(appId: sessionId, syncIdentifier: syncIdentifier,
                                scope: scope, now: Date().timeIntervalSince1970 * 1000)
    emit(["type": "state", "sessionId": attempt, "status": "starting", "reachable": session.isReachable])
    // This is a wake hint only. It can never authorize a recording when replayed.
    try? session.updateApplicationContext(["type": "wake", "protocolVersion": 2])
    if session.isReachable { session.sendMessage(["type": "wake", "protocolVersion": 2], replyHandler: nil, errorHandler: nil) }

    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    do {
      try await healthStore.startWatchApp(toHandle: configuration)
    } catch {
      let neverAdmitted = (try? journal.launchFailed(attempt)) ?? false
      emit(["type": "state", "sessionId": attempt,
            "status": neverAdmitted ? "idle" : "recovering", "reachable": session.isReachable])
      throw Exception(
        name: "WatchLaunchFailed",
        description: Self.launchFailureMessage(error)
      )
    }
    // A successful launch is not a recording acknowledgement. The invitation
    // expires even if the system never returns a useful recording result.
    DispatchQueue.main.asyncAfter(deadline: .now() + 45) { [weak self] in
      guard let self, (try? self.journal.launchFailed(attempt)) == true else { return }
      self.emit(["type": "state", "sessionId": attempt, "status": "idle", "reachable": session.isReachable])
    }
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
    if !Thread.isMainThread {
      DispatchQueue.main.async { self.send(payload) }
      return
    }
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    if #available(iOS 17.0, *), let mirror = mirror as? WatchWorkoutMirror {
      mirror.send(payload)
    }
    if session.isReachable {
      session.sendMessage(payload, replyHandler: nil) { _ in
        session.transferUserInfo(payload)
      }
    } else {
      session.transferUserInfo(payload)
    }
  }

  func sendCommand(_ payload: [String: Any]) throws {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
      throw Exception(name: "WatchUnavailable", description: "Watch connection is not ready. Try again.")
    }
    if let id = payload["sessionId"] as? String, ["end", "discard"].contains(payload["type"] as? String ?? "") {
      try close(sessionId: id, endedAt: Date().timeIntervalSince1970 * 1000, discard: payload["type"] as? String == "discard", scope: accountScope ?? "")
    } else {
      var scoped = payload
      if let appId = payload["sessionId"] as? String {
        if let id = journal.attempt(appId: appId, scope: accountScope ?? "") {
          scoped["sessionId"] = id
        } else if journal.knowsApp(appId) { return }
      }
      send(scoped)
      if payload["type"] as? String == "retry" { send(["type": "wake", "protocolVersion": 2]) }
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    emit(["type": "state", "sessionId": "", "status": session.isReachable ? "reachable" : "disconnected", "reachable": session.isReachable])
    requestStatus()
  }

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
    if session.isReachable { requestStatus() }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    receive(message)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    receive(userInfo)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    DispatchQueue.main.async {
      if message["type"] as? String == "requestStart" {
        self.resolveExpiredOffers()
        replyHandler((try? self.journal.handshake(scope: self.accountScope, now: Date().timeIntervalSince1970 * 1000,
          watchActiveId: message["activeSessionId"] as? String,
          recoveryComplete: message["recoveryComplete"] as? Bool == true)) ?? ["protocolVersion": 2])
      } else {
        self.receive(message)
        replyHandler([:])
      }
    }
  }

  func sessionEvents() -> [[String: Any]] {
    snapshots.events().map { journal.observe($0) }.filter {
      guard let scope = $0["accountScope"] as? String else { return true }
      return scope == accountScope
    }
  }

  private func receive(_ payload: [String: Any]) {
    emit(payload)
  }

  private func resolveExpiredOffers() {
    for id in (try? journal.expireUnadmitted(now: Date().timeIntervalSince1970 * 1000)) ?? [] {
      emit(["type": "state", "sessionId": id, "status": "idle", "reachable": false])
    }
  }

  private func emit(_ payload: [String: Any]) {
    DispatchQueue.main.async {
      self.snapshots.record(payload)
      let event = self.journal.observe(payload)
      if let scope = event["accountScope"] as? String, scope != self.accountScope { return }
      guard let onEvent = self.onEvent else { return }
      onEvent(event)
    }
  }
}
