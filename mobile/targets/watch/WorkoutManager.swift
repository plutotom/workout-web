import Foundation
import HealthKit

final class WorkoutManager: NSObject, ObservableObject {
  static let shared = WorkoutManager()

  @Published private(set) var status: String = "idle"
  @Published private(set) var sessionId: String = ""
  @Published private(set) var heartRate: Double?
  @Published private(set) var activeEnergyKcal: Double?
  @Published private(set) var startedAt: Date?

  var isRecording: Bool {
    status == "recording" || status == "starting"
  }

  var headline: String {
    switch status {
    case "recording": return "Recording"
    case "starting": return "Starting…"
    case "disconnected": return "Watch disconnected"
    case "ended": return "Saved to Health"
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
    let seconds = max(0, Int(Date().timeIntervalSince(start)))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }

  private let healthStore = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private var syncIdentifier = ""
  private let defaults = UserDefaults.standard

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

  func prepare() {
    recoverIfNeeded()
    Task { try? await requestAuthorization() }
  }

  func recoverIfNeeded() {
    healthStore.recoverActiveWorkoutSession { [weak self] session, _ in
      guard let self, let session else { return }
      DispatchQueue.main.async {
        self.attach(session: session, sessionId: self.defaults.string(forKey: "watch.sessionId") ?? "")
        self.syncIdentifier = self.defaults.string(forKey: "watch.syncIdentifier") ?? ""
        self.status = session.state == .running ? "recording" : "disconnected"
        self.mirrorState()
      }
    }
  }

  func endFromWatch() {
    end(discard: false)
  }

  func discard() {
    end(discard: true)
  }

  private func start(
    configuration: HKWorkoutConfiguration,
    sessionId: String,
    startedAtMs: Double,
    syncIdentifier: String
  ) {
    if session?.state == .running { return }
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
      builder.dataSource = HKLiveWorkoutDataSource(
        healthStore: healthStore,
        workoutConfiguration: configuration
      )
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
  }

  private func end(discard: Bool) {
    guard let session else {
      status = "idle"
      mirrorState()
      return
    }
    if discard {
      session.end()
      builder?.discardWorkout()
      clear()
      PhoneBridge.shared.send([
        "type": "ended",
        "sessionId": sessionId,
        "healthUuid": "",
      ])
      return
    }
    session.end()
  }

  private func finishBuilder(endDate: Date) {
    builder?.endCollection(withEnd: endDate) { [weak self] _, _ in
      self?.builder?.finishWorkout { workout, _ in
        DispatchQueue.main.async {
          guard let self else { return }
          let uuid = workout?.uuid.uuidString ?? ""
          PhoneBridge.shared.send([
            "type": "ended",
            "sessionId": self.sessionId,
            "healthUuid": uuid,
          ])
          self.status = "ended"
          self.mirrorState()
          self.session = nil
          self.builder = nil
        }
      }
    }
  }

  private func clear() {
    session = nil
    builder = nil
    status = "idle"
    heartRate = nil
    activeEnergyKcal = nil
    defaults.removeObject(forKey: "watch.sessionId")
    defaults.removeObject(forKey: "watch.syncIdentifier")
    mirrorState()
  }

  private func requestAuthorization() async throws {
    let types: Set<HKSampleType> = [
      HKObjectType.workoutType(),
      HKQuantityType.quantityType(forIdentifier: .heartRate)!,
      HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned)!,
    ]
    try await healthStore.requestAuthorization(toShare: types, read: types)
  }

  func mirrorState() {
    PhoneBridge.shared.send([
      "type": "state",
      "sessionId": sessionId,
      "status": status,
      "reachable": true,
    ])
    PhoneBridge.shared.send([
      "type": "metrics",
      "heartRate": heartRate as Any,
      "activeEnergyKcal": activeEnergyKcal as Any,
      "durationSeconds": durationSeconds(),
    ])
  }

  private func durationSeconds() -> Int {
    let start = startedAt ?? session?.startDate
    guard let start else { return 0 }
    return max(0, Int(Date().timeIntervalSince(start)))
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
      if toState == .ended {
        self.finishBuilder(endDate: date)
      } else if toState == .running {
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
      self.status = "idle"
      self.mirrorState()
    }
  }

  func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didDisconnectFrom device: HKDevice
  ) {
    DispatchQueue.main.async {
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
      if let nextHeartRate { self.heartRate = nextHeartRate }
      if let nextEnergy { self.activeEnergyKcal = nextEnergy }
      self.mirrorState()
    }
  }
}
