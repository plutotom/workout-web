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
    case "saving": return discardOnEnd ? "Discarding recording…" : "Saving to Health…"
    case "saveFailed": return "Health update needs attention"
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
  private var reconciliationAttempt: UUID?

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
        defer { self.recoveryInFlight = false }
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
        } else if let record = self.finalizationRecord(), let id = record["sessionId"] as? String {
          self.sessionId = id
          self.syncIdentifier = record["syncIdentifier"] as? String ?? ""
          self.collectionEndDate = (record["endedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
          self.startedAt = (record["startedAt"] as? Double).map { Date(timeIntervalSince1970: $0) }
          self.discardOnEnd = record["discard"] as? Bool ?? false
          self.status = "saveFailed"
          self.workoutError = "The Health update was interrupted. Unlock your Watch and retry recovery."
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
        let pending = self.defaults.dictionary(forKey: "watch.pendingEnds") as? [String: Bool] ?? [:]
        for (id, discard) in pending {
          self.endFromPhone(sessionId: id, discard: discard)
        }
        if let record = self.finalizationRecord(), pending[self.sessionId] == nil,
           self.reconciliationAttempt == nil, !self.isClosing {
          self.requestEnd(discard: record["discard"] as? Bool ?? false)
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
    if recoveryPending || isClosing || status == "saveFailed" || finalizationRecord() != nil {
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
    self.syncIdentifier = syncIdentifier.isEmpty ? "grayed-lift-watch:\(sessionId)" : syncIdentifier
    defaults.set(sessionId, forKey: "watch.sessionId")
    defaults.set(self.syncIdentifier, forKey: "watch.syncIdentifier")
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
      let pending = defaults.dictionary(forKey: "watch.pendingEnds") as? [String: Bool] ?? [:]
      requestEnd(discard: pending[target] ?? discard)
    } else if !target.isEmpty {
      // Finish may beat a delayed Start. Close only after recovery has proved
      // this identity is not the active HealthKit workout.
      notifyEnded(healthUuid: "", sessionId: target)
    }
  }

  private func requestEnd(discard: Bool) {
    discardOnEnd = discardOnEnd || discard
    if finalizationRecord() != nil { recordFinalization(discard: discardOnEnd) }
    // A Discard must remain durable while the Health save callback is pending.
    if saveInFlight || reconciliationAttempt != nil { mirrorState(); return }
    if let phase = finalizationRecord()?["phase"] as? String,
       ["saving", "saved", "discarded"].contains(phase) {
      reconcileFinalization()
      return
    }
    guard let session else {
      if finalizationRecord() != nil {
        if discardOnEnd { completeDiscard() }
        else {
          // No active builder does not establish whether a save succeeded.
          // Retry goes through HealthKit recovery even when initiated by iPhone.
          if !recoveryInFlight {
            recoveryPending = true
            status = "recovering"
            mirrorState()
            recoverIfNeeded()
            return
          }
          status = "saveFailed"
          workoutError = "The recording couldn’t be restored. Retry recovery, or discard this failed recording."
          mirrorState()
        }
        return
      }
      if status == "saveFailed" && !discard {
        if !recoveryInFlight { retryWorkoutOperation() }
        mirrorState()
        return
      }
      if !sessionId.isEmpty { notifyEnded(healthUuid: "") }
      clear()
      drainPendingStarts()
      return
    }
    collectionEndDate = collectionEndDate ?? Date()
    // Write the complete identity and phase BEFORE ending the active session.
    recordFinalization(phase: finalizationRecord()?["phase"] as? String ?? "ending", discard: discardOnEnd)
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
    recordFinalization(phase: collectionEnded ? "collected" : "collecting", discard: discardOnEnd)
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
    completeDiscard()
  }

  private func finishBuilder(endDate: Date) {
    guard let closingSession = session, let closingBuilder = builder else { return }
    let closingId = sessionId
    let attempt = UUID()
    closingAttempt = attempt
    let finish: () -> Void = { [weak self] in
      guard let self, self.ownsClosingAttempt(attempt, session: closingSession, builder: closingBuilder, id: closingId) else { return }
      if self.discardOnEnd { self.discardBuilder(); return }
      closingBuilder.addMetadata([
        HKMetadataKeySyncIdentifier: self.syncIdentifier,
        HKMetadataKeySyncVersion: NSNumber(value: 1),
      ]) { success, error in
        DispatchQueue.main.async {
          guard self.ownsClosingAttempt(attempt, session: closingSession, builder: closingBuilder, id: closingId) else { return }
          if self.discardOnEnd { self.discardBuilder(); return }
          guard success, error == nil else {
            self.failClosing("Couldn’t prepare the Health save. Unlock your Watch and retry.")
            return
          }
          self.saveInFlight = true
          self.recordFinalization(phase: "saving")
          closingBuilder.finishWorkout { workout, error in
            DispatchQueue.main.async {
              guard self.ownsClosingAttempt(attempt, session: closingSession, builder: closingBuilder, id: closingId) else { return }
              self.saveInFlight = false
              if error != nil {
                self.recordFinalization(phase: "failed")
                if self.discardOnEnd { self.discardBuilder(); return }
                self.failClosing("Couldn’t save to Apple Health. Unlock your Watch, check Health access, and retry saving.")
                return
              }
              // (nil, nil) means saved while locked, not an unsaved recording.
              self.recordFinalization(phase: "saved", healthUuid: workout?.uuid.uuidString ?? "")
              if self.discardOnEnd { self.reconcileFinalization(knownWorkout: workout) }
              else { self.completeSave(healthUuid: workout?.uuid.uuidString ?? "") }
            }
          }
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
        self.recordFinalization(phase: "collected")
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
    // Keep a saving/saved phase intact: an ambiguous commit must not become a
    // known unsaved failure just because reconciliation could not read Health.
    if let phase = finalizationRecord()?["phase"] as? String,
       !["saving", "saved", "discarded"].contains(phase) { recordFinalization(phase: "failed") }
    defaults.set(sessionId, forKey: "watch.failedSaveSessionId")
    mirrorState()
  }

  private func finalizationRecord() -> [String: Any]? {
    defaults.dictionary(forKey: "watch.finalization")
  }

  private func recordFinalization(phase: String? = nil, discard: Bool? = nil, healthUuid: String? = nil) {
    guard !sessionId.isEmpty else { return }
    var record = finalizationRecord() ?? [
      "sessionId": sessionId, "syncIdentifier": syncIdentifier,
      "startedAt": (startedAt ?? session?.startDate ?? Date()).timeIntervalSince1970,
      "endedAt": (collectionEndDate ?? Date()).timeIntervalSince1970,
      "phase": "ending", "discard": false,
    ]
    guard record["sessionId"] as? String == sessionId else { return }
    if let phase { record["phase"] = phase }
    if let discard { record["discard"] = (record["discard"] as? Bool ?? false) || discard }
    if let healthUuid { record["healthUuid"] = healthUuid }
    defaults.set(record, forKey: "watch.finalization")
  }

  private func completeSave(healthUuid: String) {
    notifyEnded(healthUuid: healthUuid, healthSaved: true)
    releaseWorkout()
    status = "ended"
    mirrorState()
    drainPendingStarts()
  }

  private func completeDiscard() {
    recordFinalization(phase: "discarded", discard: true)
    notifyEnded(healthUuid: "")
    clear()
    drainPendingStarts()
  }

  private func reconcileFinalization(knownWorkout: HKWorkout? = nil) {
    guard let record = finalizationRecord(), let id = record["sessionId"] as? String,
          id == sessionId, reconciliationAttempt == nil else { return }
    if record["phase"] as? String == "discarded" { completeDiscard(); return }
    let discard = record["discard"] as? Bool ?? false
    if record["phase"] as? String == "saved" && !discard {
      completeSave(healthUuid: record["healthUuid"] as? String ?? "")
      return
    }
    let token = UUID()
    reconciliationAttempt = token
    closingAttempt = nil // No old builder callback may finalize this identity.
    isClosing = true
    status = "saving"
    workoutError = nil
    mirrorState()
    let resolve: ([HKWorkout]?, Error?) -> Void = { [weak self] workouts, error in
      DispatchQueue.main.async {
        guard let self, self.reconciliationAttempt == token, self.sessionId == id,
              self.finalizationRecord()?["sessionId"] as? String == id else { return }
        guard error == nil, let workouts, !workouts.isEmpty else {
          self.reconciliationAttempt = nil
          // Empty reads are not proof of absence (locked or declined read access).
          self.failClosing("Couldn’t confirm the Health update. Unlock your Watch, allow reading Workouts in iPhone Health, then retry. A pending Discard will be kept.")
          return
        }
        if self.finalizationRecord()?["discard"] as? Bool != true {
          self.recordFinalization(phase: "saved", healthUuid: workouts[0].uuid.uuidString)
          self.reconciliationAttempt = nil
          self.completeSave(healthUuid: workouts[0].uuid.uuidString)
          return
        }
        // Persist the committed object before deletion. A failed or interrupted
        // delete must retain Discard and must never retry finishWorkout.
        self.recordFinalization(phase: "saved", discard: true, healthUuid: workouts[0].uuid.uuidString)
        self.healthStore.delete(workouts) { success, error in
          DispatchQueue.main.async {
            guard self.reconciliationAttempt == token, self.sessionId == id else { return }
            self.reconciliationAttempt = nil
            guard success, error == nil else {
              self.failClosing("Couldn’t remove the recording from Health. Unlock your Watch and retry. Discard is still pending.")
              return
            }
            self.completeDiscard()
          }
        }
      }
    }
    if let knownWorkout { resolve([knownWorkout], nil); return }
    guard let sync = record["syncIdentifier"] as? String, !sync.isEmpty else {
      resolve(nil, nil)
      return
    }
    let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [
      HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: [sync]),
      HKQuery.predicateForObjects(from: HKSource.default()),
    ])
    let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate,
                              limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
      resolve(samples as? [HKWorkout], error)
    }
    healthStore.execute(query)
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
    defaults.removeObject(forKey: "watch.finalization")
    reconciliationAttempt = nil
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
