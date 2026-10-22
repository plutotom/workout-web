import Foundation
import HealthKit

final class WorkoutManager: NSObject, ObservableObject {
  static let shared = WorkoutManager()

  @Published private(set) var status: String = "idle"
  @Published private(set) var sessionId: String = ""
  @Published private(set) var heartRate: Double?
  @Published private(set) var activeEnergyKcal: Double?
  @Published private(set) var startedAt: Date?
  @Published private(set) var workoutError: String?
  @Published private(set) var healthAccessError: String?
  @Published private(set) var requestingHealthAccess = false
  /// Drives smooth UI updates for the duration label.
  @Published private(set) var now: Date = Date()

  var isRecording: Bool {
    status == "recording" || status == "starting" || status == "disconnected"
  }

  var headline: String {
    switch status {
    case "recording": return "Recording"
    case "starting": return "Starting…"
    case "disconnected": return "Watch disconnected"
    case "ended": return "Saved to Health"
    case "recovering": return "Restoring workout…"
    case "saving": return "Saving to Health…"
    case "saveFailed": return "Health save needs attention"
    default: return "Workout"
    }
  }

  var heartRateLabel: String {
    guard let heartRate else { return "—"}
    return String(Int(heartRate.rounded()))
  }

  var energyLabel: String {
    guard let activeEnergyKcal else { return "—"}
    return String(Int(activeEnergyKcal.rounded()))
  }

  var durationLabel: String {
    let start = startedAt ?? session?.startDate
    guard let start else { return "0:00" }
    let seconds = max(0, Int(now.timeIntervalSince(start)))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }

  private let healthStore = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private var syncIdentifier = ""
  private let defaults = UserDefaults.standard
  private var tickTimer: Timer?
  /// Discard the Health workout only after HKWorkoutSession reaches `.ended`.
  private var discardOnEnd = false
  private var isClosing = false
  // Gate commands from construction, before WCSession activation can deliver them.
  private var recoveryPending = true
  private var recoveryInFlight = false
  private var pendingStarts: [(id: String, run: () -> Void)] = []
  private var closingAttempt: UUID?
  private var collectionEnded = false
  private var collectionEndDate: Date?
  private var saveInFlight = false

  private func startTickingIfNeeded() {
    guard tickTimer == nil else { return }
    tickTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
      guard let self else { return }
      DispatchQueue.main.async {
        self.now = Date()
      }
    }
  }

  private func stopTicking() {
    tickTimer?.invalidate()
    tickTimer = nil
  }

  func handle(configuration: HKWorkoutConfiguration) {
    let context = PhoneBridge.shared.latestStartContext()
    start(
      configuration: configuration,
      sessionId: context.sessionId,
      startedAtMs: context.startedAt,
      syncIdentifier: context.syncIdentifier
    )
  }

  func startFromPhone(sessionId: String, startedAtMs: Double, syncIdentifier: String) {
    let configuration = HKWorkoutConfiguration()
    configuration.activityType = .traditionalStrengthTraining
    configuration.locationType = .indoor
    start(
      configuration: configuration,
      sessionId: sessionId,
      startedAtMs: startedAtMs,
      syncIdentifier: syncIdentifier
    )
  }

  @MainActor
  func reviewHealthAccess() async {
    guard !requestingHealthAccess else { return }
    requestingHealthAccess = true
    defer { requestingHealthAccess = false }
    do {
      try await requestAuthorization()
      // Completing a request does not prove read access was granted. HealthKit
      // deliberately keeps that decision private; missing data gets neutral help.
      healthAccessError = nil
    } catch {
      healthAccessError = "Couldn’t request Health access. Try again with your Watch unlocked."
    }
  }

  func prepare() {
    recoverIfNeeded()
  }

  func recoverIfNeeded() {
    guard recoveryPending, !recoveryInFlight, session == nil else { return }
    recoveryInFlight = true
    healthStore.recoverActiveWorkoutSession { [weak self] recovered, error in
      DispatchQueue.main.async {
        guard let self else { return }
        self.recoveryInFlight = false
        guard error == nil else {
          self.status = "recovering"
          self.workoutError = "Couldn’t restore the Watch workout. Unlock your Watch and retry recovery."
          self.mirrorState()
          return // Never acknowledge pending commands while recovery is unknown.
        }
        self.workoutError = nil
        self.recoveryPending = false
        if let recovered {
          self.attach(session: recovered, sessionId: self.defaults.string(forKey: "watch.sessionId") ?? "")
          self.syncIdentifier = self.defaults.string(forKey: "watch.syncIdentifier") ?? ""
          self.startedAt = recovered.startDate
          self.collectionEnded = self.builder?.endDate != nil
          self.collectionEndDate = self.builder?.endDate
          self.status = recovered.state == .running ? "recording" : "disconnected"
        } else if let failedId = self.defaults.string(forKey: "watch.failedSaveSessionId") {
          // An ended builder may no longer be recoverable after process death.
          // Keep the failure visible; never invent a successful empty-UUID ending.
          self.sessionId = failedId
          self.status = "saveFailed"
          self.workoutError = "The recording couldn’t be restored. Retry recovery, or discard this failed recording."
        } else {
          self.sessionId = ""
          self.status = "idle"
        }
        // Replay durable closures before queued starts, including after a crash.
        for (id, discard) in self.defaults.dictionary(forKey: "watch.pendingEnds") as? [String: Bool] ?? [:] {
          self.endFromPhone(sessionId: id, discard: discard)
        }
        self.mirrorState()
        self.drainPendingStarts()
      }
    }
  }

  func retryWorkoutOperation() {
    if recoveryPending {
      recoverIfNeeded()
    } else if session == nil && status == "saveFailed" {
      recoveryPending = true
      recoverIfNeeded()
    } else {
      requestEnd(discard: false)
    }
  }

  func endFromWatch() {
    endFromPhone(sessionId: nil, discard: false)
  }

  func discard() {
    endFromPhone(sessionId: nil, discard: true)
  }

  func replyToStatus(sessionId requested: String?) {
    if recoveryPending {
      recoverIfNeeded()
      if let requested, !requested.isEmpty {
        PhoneBridge.shared.send(["type": "state", "sessionId": requested, "status": "recovering", "reachable": true])
      }
      return
    }
    if let requested, !requested.isEmpty {
      if let uuid = defaults.dictionary(forKey: "watch.closedResults")?[requested] as? String {
        PhoneBridge.shared.send(["type": "ended", "sessionId": requested, "healthUuid": uuid,
                                 "healthSaved": !uuid.isEmpty || (defaults.stringArray(forKey: "watch.savedSessions") ?? []).contains(requested)])
      } else if requested != sessionId {
        PhoneBridge.shared.send(["type": "state", "sessionId": requested, "status": "idle", "reachable": true])
      }
    }
    mirrorState()
  }

  private func start(
    configuration: HKWorkoutConfiguration,
    sessionId: String,
    startedAtMs: Double,
    syncIdentifier: String
  ) {
    if recoveryPending || isClosing || status == "saveFailed" {
      if !pendingStarts.contains(where: { $0.id == sessionId }) {
        pendingStarts.append((id: sessionId, run: { [weak self] in
          self?.start(configuration: configuration, sessionId: sessionId,
                      startedAtMs: startedAtMs, syncIdentifier: syncIdentifier)
        }))
      }
      if recoveryPending { recoverIfNeeded() }
      return
    }
    // Retain ownership until finalization releases BOTH objects, not just until
    // the HKWorkoutSession leaves .running.
    guard session == nil, builder == nil else { mirrorState(); return }
    if !WatchSessionIdentity.shouldStart(sessionId, recording: session?.state == .running, closedIds: defaults.stringArray(forKey: "watch.closedSessions") ?? []) {
      mirrorState()
      return
    }
    discardOnEnd = false
    isClosing = false
    collectionEnded = false
    collectionEndDate = nil
    workoutError = nil
    heartRate = nil
    activeEnergyKcal = nil
    self.sessionId = sessionId
    self.syncIdentifier = syncIdentifier
    defaults.set(sessionId, forKey: "watch.sessionId")
    defaults.set(syncIdentifier, forKey: "watch.syncIdentifier")
    status = "starting"
    startedAt = startedAtMs > 0
      ? Date(timeIntervalSince1970: startedAtMs / 1000)
      : Date()

    // startWatchApp times out if we wait on the Health permission sheet.
    do {
      let session = try HKWorkoutSession(
        healthStore: healthStore,
        configuration: configuration
      )
      let builder = session.associatedWorkoutBuilder()
      attach(session: session, sessionId: sessionId)
      self.builder = builder
      session.startActivity(with: startedAt ?? Date())
      builder.beginCollection(withStart: startedAt ?? Date()) { _, _ in }
      if !syncIdentifier.isEmpty {
        builder.addMetadata([
          HKMetadataKeySyncIdentifier: syncIdentifier,
          HKMetadataKeySyncVersion: NSNumber(value: 1),
        ]) { _, _ in }
      }
      status = "recording"
      mirrorState()
    } catch {
      status = "idle"
      mirrorState()
    }
  }

  private func attach(session: HKWorkoutSession, sessionId: String) {
    self.session = session
    self.sessionId = sessionId
    session.delegate = self
    builder = session.associatedWorkoutBuilder()
    builder?.delegate = self
    // HealthKit restores the session and builder after a crash, but the live
    // data source must be attached again to resume metric delivery.
    builder?.dataSource = HKLiveWorkoutDataSource(
      healthStore: healthStore,
      workoutConfiguration: session.workoutConfiguration
    )
  }

  func endFromPhone(sessionId requestedId: String?, discard: Bool) {
    let target = requestedId ?? (sessionId.isEmpty ? defaults.string(forKey: "watch.sessionId") ?? "" : sessionId)
    if !target.isEmpty {
      var pending = defaults.dictionary(forKey: "watch.pendingEnds") as? [String: Bool] ?? [:]
      pending[target] = (pending[target] ?? false) || discard
      defaults.set(pending, forKey: "watch.pendingEnds")
    }
    if recoveryPending {
      recoverIfNeeded()
      return
    }
    if WatchSessionIdentity.matchesCommand(target, currentId: sessionId) {
      requestEnd(discard: discard)
    } else if !target.isEmpty {
      // Finish may beat a delayed Start. Close only after recovery has proved
      // this identity is not the active HealthKit workout.
      notifyEnded(healthUuid: "", sessionId: target)
    }
  }

  private func requestEnd(discard: Bool) {
    discardOnEnd = discardOnEnd || discard
    guard let session else {
      if status == "saveFailed" && !discard { return }
      if !sessionId.isEmpty { notifyEnded(healthUuid: "") }
      clear()
      drainPendingStarts()
      return
    }
    switch session.state {
    case .ended, .stopped:
      handleSessionEnded(date: collectionEndDate ?? Date())
    default:
      session.end()
    }
  }

  private func handleSessionEnded(date: Date) {
    guard !isClosing, session != nil, builder != nil else { return }
    isClosing = true
    collectionEndDate = collectionEndDate ?? date
    if discardOnEnd {
      discardBuilder()
      return
    }
    status = "saving"
    mirrorState()
    finishBuilder(endDate: collectionEndDate ?? date)
  }

  private func discardBuilder() {
    guard !saveInFlight else { return }
    builder?.discardWorkout()
    notifyEnded(healthUuid: "")
    clear()
    drainPendingStarts()
  }

  private func finishBuilder(endDate: Date) {
    guard let closingSession = session, let closingBuilder = builder else { return }
    let closingId = sessionId
    let attempt = UUID()
    closingAttempt = attempt
    let finish: () -> Void = { [weak self] in
      guard let self, self.ownsClosingAttempt(attempt, session: closingSession, builder: closingBuilder, id: closingId) else { return }
      if self.discardOnEnd { self.discardBuilder(); return }
      self.saveInFlight = true
      closingBuilder.finishWorkout { workout, error in
        DispatchQueue.main.async {
          guard self.ownsClosingAttempt(attempt, session: closingSession, builder: closingBuilder, id: closingId) else { return }
          self.saveInFlight = false
          if error != nil {
            if self.discardOnEnd { self.discardBuilder(); return }
            self.failClosing("Couldn’t save to Apple Health. Unlock your Watch, check Health access, and retry saving.")
            return
          }
          // Apple documents (nil, nil) as a successful save while locked.
          // Preserve that evidence even without a UUID; never export a duplicate.
          self.notifyEnded(healthUuid: workout?.uuid.uuidString ?? "", healthSaved: true)
          self.releaseWorkout()
          self.status = "ended"
          self.mirrorState()
          self.drainPendingStarts()
        }
      }
    }
    if collectionEnded { finish(); return }
    closingBuilder.endCollection(withEnd: endDate) { [weak self] success, error in
      DispatchQueue.main.async {
        guard let self, self.ownsClosingAttempt(attempt, session: closingSession, builder: closingBuilder, id: closingId) else { return }
        if self.discardOnEnd { self.discardBuilder(); return }
        guard success, error == nil else {
          self.failClosing("Couldn’t finish collecting the workout. Unlock your Watch and retry saving.")
          return
        }
        self.collectionEnded = true
        finish()
      }
    }
  }

  private func ownsClosingAttempt(_ attempt: UUID, session: HKWorkoutSession, builder: HKLiveWorkoutBuilder, id: String) -> Bool {
    closingAttempt == attempt && self.session === session && self.builder === builder && sessionId == id
  }

  private func failClosing(_ message: String) {
    isClosing = false
    closingAttempt = nil
    status = "saveFailed"
    workoutError = message
    defaults.set(sessionId, forKey: "watch.failedSaveSessionId")
    mirrorState()
  }

  private func notifyEnded(healthUuid: String, sessionId targetId: String? = nil, healthSaved: Bool = false) {
    let sessionId = targetId ?? self.sessionId
    var closed = defaults.stringArray(forKey: "watch.closedSessions") ?? []
    if !sessionId.isEmpty && !closed.contains(sessionId) { closed.append(sessionId) }
    defaults.set(Array(closed.suffix(16)), forKey: "watch.closedSessions")
    var results = defaults.dictionary(forKey: "watch.closedResults") as? [String: String] ?? [:]
    if results[sessionId]?.isEmpty != false { results[sessionId] = healthUuid }
    results = results.filter { closed.suffix(16).contains($0.key) }
    defaults.set(results, forKey: "watch.closedResults")
    var saved = defaults.stringArray(forKey: "watch.savedSessions") ?? []
    if (healthSaved || !healthUuid.isEmpty) && !saved.contains(sessionId) { saved.append(sessionId) }
    saved = saved.filter { closed.suffix(16).contains($0) }
    defaults.set(saved, forKey: "watch.savedSessions")
    var pending = defaults.dictionary(forKey: "watch.pendingEnds") as? [String: Bool] ?? [:]
    pending.removeValue(forKey: sessionId)
    defaults.set(pending, forKey: "watch.pendingEnds")
    PhoneBridge.shared.send([
      "type": "ended", "sessionId": sessionId,
      "healthUuid": results[sessionId] ?? healthUuid,
      "healthSaved": saved.contains(sessionId),
    ])
  }

  private func releaseWorkout() {
    session = nil
    builder = nil
    isClosing = false
    closingAttempt = nil
    collectionEnded = false
    collectionEndDate = nil
    saveInFlight = false
    discardOnEnd = false
    workoutError = nil
    defaults.removeObject(forKey: "watch.sessionId")
    defaults.removeObject(forKey: "watch.syncIdentifier")
    defaults.removeObject(forKey: "watch.failedSaveSessionId")
  }

  private func clear() {
    releaseWorkout()
    status = "idle"
    heartRate = nil
    activeEnergyKcal = nil
    stopTicking()
    mirrorState()
  }

  private func drainPendingStarts() {
    guard !recoveryPending, session == nil, builder == nil, status != "saveFailed" else { return }
    let starts = pendingStarts
    pendingStarts.removeAll()
    for start in starts { start.run() }
  }

  private func requestAuthorization() async throws {
    let readTypes: Set<HKObjectType> = [
      HKObjectType.workoutType(),
      HKQuantityType.quantityType(forIdentifier: .heartRate)!,
      HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
    ]
    try await healthStore.requestAuthorization(
      toShare: [HKObjectType.workoutType()], read: readTypes
    )
  }

  func mirrorState() {
    if isRecording {
      startTickingIfNeeded()
    } else {
      stopTicking()
    }
    PhoneBridge.shared.send([
      "type": "state",
      "sessionId": sessionId,
      "status": status,
      "reachable": true,
    ])
    var metrics: [String: Any] = [
      "type": "metrics",
      "sessionId": sessionId,
      "durationSeconds": durationSeconds(),
    ]
    // WatchConnectivity payloads must contain property-list values, never boxed nil.
    if let heartRate { metrics["heartRate"] = heartRate }
    if let activeEnergyKcal { metrics["activeEnergyKcal"] = activeEnergyKcal }
    PhoneBridge.shared.send(metrics)
  }

  private func durationSeconds() -> Int {
    let start = startedAt ?? session?.startDate
    guard let start else { return 0 }
    return max(0, Int(now.timeIntervalSince(start)))
  }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
  func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {
    DispatchQueue.main.async {
      guard self.session === workoutSession else { return }
      if toState == .ended || toState == .stopped {
        self.handleSessionEnded(date: date)
      } else if toState == .running && !self.isClosing && self.status != "saveFailed" {
        self.status = "recording"
        self.mirrorState()
      }
    }
  }

  func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didFailWithError error: Error
  ) {
    DispatchQueue.main.async {
      guard self.session === workoutSession, !self.isClosing else { return }
      self.failClosing("The Watch workout stopped unexpectedly. Unlock your Watch and retry saving.")
    }
  }

  func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didDisconnectFrom device: HKDevice
  ) {
    DispatchQueue.main.async {
      guard self.session === workoutSession, !self.isClosing, self.status != "saveFailed" else { return }
      self.status = "disconnected"
      self.mirrorState()
    }
  }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder,
    didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    var nextHeartRate: Double?
    var nextEnergy: Double?
    for type in collectedTypes {
      guard let quantityType = type as? HKQuantityType,
            let statistics = workoutBuilder.statistics(for: quantityType)
      else { continue }
      if quantityType == HKQuantityType.quantityType(forIdentifier: .heartRate) {
        nextHeartRate = statistics
          .mostRecentQuantity()?
          .doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
      }
      if quantityType == HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned) {
        nextEnergy = statistics
          .sumQuantity()?
          .doubleValue(for: .kilocalorie())
      }
    }
    DispatchQueue.main.async {
      guard self.builder === workoutBuilder else { return }
      if let nextHeartRate { self.heartRate = nextHeartRate }
      if let nextEnergy { self.activeEnergyKcal = nextEnergy }
      self.mirrorState()
    }
  }
}
