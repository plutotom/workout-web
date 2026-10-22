import Foundation

// The lifecycle methods are copied verbatim from WorkoutManager.swift. Only
// HealthKit, defaults, and transport I/O are simulated, with held callbacks.
enum SessionState { case notStarted, running, stopped, ended }
enum Activity { case traditionalStrengthTraining }
enum Location { case indoor }
final class HKWorkoutConfiguration {
  var activityType = Activity.traditionalStrengthTraining
  var locationType = Location.indoor
}
final class HKHealthStore {
  var recovery: ((HKWorkoutSession?, Error?) -> Void)?
  var recoveryCalls = 0
  func recoverActiveWorkoutSession(completion: @escaping (HKWorkoutSession?, Error?) -> Void) {
    recoveryCalls += 1
    recovery = completion
  }
  func completeRecovery(_ session: HKWorkoutSession?, error: Error? = nil) {
    let completion = recovery
    recovery = nil
    completion?(session, error)
    drainMainQueue()
  }
}
let HKMetadataKeySyncIdentifier = "sync"
let HKMetadataKeySyncVersion = "version"
final class HKLiveWorkoutDataSource {
  init(healthStore: HKHealthStore, workoutConfiguration: HKWorkoutConfiguration) {}
}
final class TestWorkout { let uuid = UUID() }
final class HKWorkoutSession {
  var state: SessionState = .notStarted
  var endCount = 0
  var delegate: AnyObject?
  let workoutConfiguration: HKWorkoutConfiguration
  let builder = HKLiveWorkoutBuilder()
  var startDate: Date?
  init(healthStore: HKHealthStore, configuration: HKWorkoutConfiguration) throws { workoutConfiguration = configuration }
  func associatedWorkoutBuilder() -> HKLiveWorkoutBuilder { builder }
  func startActivity(with date: Date) { startDate = date; state = .running }
  func end() { endCount += 1 }
}
final class HKLiveWorkoutBuilder {
  var delegate: AnyObject?
  var dataSource: HKLiveWorkoutDataSource?
  var endDate: Date?
  var requestedEndDate: Date?
  var discardCount = 0
  var saveCount = 0
  var savedCount = 0
  var endCollectionCount = 0
  var failSave = false
  var locked = false
  var deferSave = false
  var collectionCompletion: ((Bool, Error?) -> Void)?
  var saveCompletion: ((TestWorkout?, Error?) -> Void)?
  func beginCollection(withStart: Date, completion: (Bool, Error?) -> Void) { completion(true, nil) }
  func addMetadata(_ values: [String: Any], completion: (Bool, Error?) -> Void) { completion(true, nil) }
  func discardWorkout() { discardCount += 1 }
  func endCollection(withEnd date: Date, completion: @escaping (Bool, Error?) -> Void) {
    endCollectionCount += 1
    requestedEndDate = date
    collectionCompletion = completion
  }
  func finishWorkout(completion: @escaping (TestWorkout?, Error?) -> Void) {
    saveCount += 1
    saveCompletion = completion
    if !deferSave { completeSave() }
  }
  func completeSave() {
    if !failSave { savedCount += 1 }
    saveCompletion?(failSave || locked ? nil : TestWorkout(), failSave ? NSError(domain: "synthetic", code: 1) : nil)
    drainMainQueue()
  }
  func completeCollection(success: Bool = true) {
    let completion = collectionCompletion
    collectionCompletion = nil
    if success { endDate = requestedEndDate }
    completion?(success, success ? nil : NSError(domain: "synthetic", code: 2))
    drainMainQueue()
  }
}
final class TestDefaults {
  var values: [String: Any] = [:]
  func string(forKey key: String) -> String? { values[key] as? String }
  func stringArray(forKey key: String) -> [String]? { values[key] as? [String] }
  func dictionary(forKey key: String) -> [String: Any]? { values[key] as? [String: Any] }
  func set(_ value: Any, forKey key: String) { values[key] = value }
  func removeObject(forKey key: String) { values.removeValue(forKey: key) }
}
final class PhoneBridge {
  static let shared = PhoneBridge()
  var events: [[String: Any]] = []
  func send(_ payload: [String: Any]) { events.append(payload) }
}
final class TestManager {
  let healthStore = HKHealthStore()
  var session: HKWorkoutSession?
  var builder: HKLiveWorkoutBuilder?
  var status = "idle"
  var sessionId = ""
  var syncIdentifier = ""
  var startedAt: Date?
  var heartRate: Double?
  var activeEnergyKcal: Double?
  var workoutError: String?
  var discardOnEnd = false
  var isClosing = false
  var recoveryPending = true
  var recoveryInFlight = false
  var pendingStarts: [(id: String, run: () -> Void)] = []
  var closingAttempt: UUID?
  var collectionEnded = false
  var collectionEndDate: Date?
  var saveInFlight = false
  var defaults = TestDefaults()
  func mirrorState() { PhoneBridge.shared.send(["type": "state", "status": status, "sessionId": sessionId]) }
  func stopTicking() {}
  func end() { endFromPhone(sessionId: nil, discard: false) }
  func discard() { endFromPhone(sessionId: nil, discard: true) }
  func deliverEnded() {
    session?.state = .ended
    handleSessionEnded(date: Date(timeIntervalSince1970: 200))
  }
  // WORKOUT_MANAGER_OPENING_METHODS
  // WORKOUT_MANAGER_CLOSING_METHODS
}
func drainMainQueue() { RunLoop.main.run(until: Date().addingTimeInterval(0.01)) }

var manager = TestManager()
let scenario = CommandLine.arguments[1]
var extra: [String: Any] = [:]
var trackedBuilder: HKLiveWorkoutBuilder?
var trackedSession: HKWorkoutSession?
if !scenario.hasPrefix("recovery-") {
  manager.recoverIfNeeded()
  manager.healthStore.completeRecovery(nil)
  manager.startFromPhone(sessionId: "test-session", startedAtMs: 1000, syncIdentifier: "test")
  trackedBuilder = manager.builder
  trackedSession = manager.session
}
switch scenario {
case "foreign-end":
  manager.endFromPhone(sessionId: "old-session", discard: false)
case "finish-before-start":
  manager.session = nil; manager.builder = nil; manager.sessionId = ""
  manager.endFromPhone(sessionId: "test-session", discard: false)
case "discard-then-end", "repeated-discard":
  manager.discard(); manager.end()
  if scenario == "repeated-discard" { manager.discard() }
  manager.deliverEnded(); manager.deliverEnded(); manager.discard()
  trackedBuilder?.completeCollection()
case "discard-during-collection":
  manager.end(); manager.deliverEnded(); manager.discard()
  trackedBuilder?.completeCollection()
case "discard-after-collection-callback":
  manager.end(); manager.deliverEnded()
  trackedBuilder?.collectionCompletion?(true, nil)
  manager.discard(); drainMainQueue()
case "normal-end", "repeated-end":
  manager.end(); manager.deliverEnded()
  if scenario == "repeated-end" { manager.end(); manager.deliverEnded() }
  trackedBuilder?.completeCollection()
case "start-during-finalization", "stale-save-callback":
  trackedBuilder!.deferSave = scenario == "stale-save-callback"
  manager.end(); manager.deliverEnded()
  manager.startFromPhone(sessionId: "next-session", startedAtMs: 2000, syncIdentifier: "next")
  extra["oldRetainedWhileClosing"] = manager.builder === trackedBuilder
  let oldCollection = trackedBuilder!.collectionCompletion
  trackedBuilder!.completeCollection()
  if scenario == "stale-save-callback" { trackedBuilder!.completeSave() }
  let nextBuilder = manager.builder!
  oldCollection?(true, nil)
  if scenario == "stale-save-callback" { trackedBuilder!.saveCompletion?(TestWorkout(), nil) }
  drainMainQueue()
  extra["newSessionId"] = manager.sessionId
  extra["newSaves"] = nextBuilder.saveCount
  extra["newRetained"] = manager.builder === nextBuilder
case "save-failure", "save-retry", "discard-save-failure":
  trackedBuilder!.failSave = true
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection()
  extra["failedStatus"] = manager.status
  extra["failureVisible"] = manager.workoutError != nil
  extra["endedBeforeRetry"] = PhoneBridge.shared.events.contains { $0["type"] as? String == "ended" }
  if scenario == "save-retry" {
    manager.startFromPhone(sessionId: "next-session", startedAtMs: 2000, syncIdentifier: "next")
    trackedBuilder!.failSave = false
    manager.retryWorkoutOperation()
    extra["newSessionId"] = manager.sessionId
  } else if scenario == "discard-save-failure" { manager.discard() }
case "stale-collection-retry":
  manager.end(); manager.deliverEnded()
  let oldCallback = trackedBuilder!.collectionCompletion
  trackedBuilder!.completeCollection(success: false)
  manager.retryWorkoutOperation()
  oldCallback?(true, nil); drainMainQueue()
  extra["savesBeforeCurrentCallback"] = trackedBuilder!.saveCount
  trackedBuilder!.completeCollection()
case "collection-failure", "collection-retry":
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection(success: false)
  extra["failedStatus"] = manager.status
  extra["savesBeforeRetry"] = trackedBuilder!.saveCount
  extra["failureVisible"] = manager.workoutError != nil
  let endDate = trackedBuilder!.requestedEndDate
  if scenario == "collection-retry" {
    manager.retryWorkoutOperation(); trackedBuilder!.completeCollection()
    extra["sameEndDate"] = endDate == trackedBuilder!.requestedEndDate
  }
case "locked-success":
  trackedBuilder!.locked = true
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection()
  manager.replyToStatus(sessionId: "test-session")
  extra["savedMarker"] = (manager.defaults.stringArray(forKey: "watch.savedSessions") ?? []).contains("test-session")
case "recovery-discard", "recovery-finish", "recovery-error", "recovery-crash":
  let recovered = try HKWorkoutSession(healthStore: manager.healthStore, configuration: HKWorkoutConfiguration())
  recovered.startActivity(with: Date(timeIntervalSince1970: 1))
  manager.defaults.set("test-session", forKey: "watch.sessionId")
  manager.recoverIfNeeded(); manager.recoverIfNeeded()
  manager.endFromPhone(sessionId: "test-session", discard: scenario != "recovery-finish")
  extra["ackBeforeRecovery"] = PhoneBridge.shared.events.contains { $0["type"] as? String == "ended" }
  if scenario == "recovery-error" {
    manager.healthStore.completeRecovery(nil, error: NSError(domain: "synthetic", code: 3))
    extra["ackAfterError"] = PhoneBridge.shared.events.contains { $0["type"] as? String == "ended" }
    extra["recoveryErrorVisible"] = manager.workoutError != nil
    manager.retryWorkoutOperation()
  } else if scenario == "recovery-crash" {
    let restarted = TestManager()
    restarted.defaults = manager.defaults
    manager = restarted
    manager.recoverIfNeeded()
  }
  manager.healthStore.completeRecovery(recovered)
  trackedBuilder = recovered.builder; trackedSession = recovered
  extra["recoveryCalls"] = manager.healthStore.recoveryCalls
  manager.deliverEnded(); trackedBuilder!.completeCollection()
case "recovery-no-active-after-error":
  manager.recoverIfNeeded()
  manager.healthStore.completeRecovery(nil, error: NSError(domain: "synthetic", code: 4))
  manager.retryWorkoutOperation()
  manager.healthStore.completeRecovery(nil)
  extra["errorCleared"] = manager.workoutError == nil
case "recovery-start-and-close":
  manager.startFromPhone(sessionId: "test-session", startedAtMs: 1000, syncIdentifier: "test")
  manager.startFromPhone(sessionId: "test-session", startedAtMs: 1000, syncIdentifier: "test")
  extra["queuedStartCount"] = manager.pendingStarts.count
  extra["createdBeforeRecovery"] = manager.session != nil
  manager.endFromPhone(sessionId: "test-session", discard: true)
  manager.healthStore.completeRecovery(nil)
case "recovery-lost-failed-builder":
  manager.defaults.set("test-session", forKey: "watch.failedSaveSessionId")
  manager.defaults.set(["test-session": false], forKey: "watch.pendingEnds")
  manager.recoverIfNeeded(); manager.healthStore.completeRecovery(nil)
  extra["failureVisible"] = manager.workoutError != nil
  extra["failedStatus"] = manager.status
  extra["ackBeforeDiscard"] = PhoneBridge.shared.events.contains { $0["type"] as? String == "ended" }
  manager.discard()
default: fatalError("Unknown scenario")
}
let ended = PhoneBridge.shared.events.filter { $0["type"] as? String == "ended" }
var result: [String: Any] = [
  "saves": trackedBuilder?.saveCount ?? 0,
  "savedCount": trackedBuilder?.savedCount ?? 0,
  "discards": trackedBuilder?.discardCount ?? 0,
  "collections": trackedBuilder?.endCollectionCount ?? 0,
  "released": manager.session == nil && manager.builder == nil,
  "healthUuids": ended.map { $0["healthUuid"] as? String ?? "" },
  "healthSaved": ended.map { $0["healthSaved"] as? Bool ?? false },
  "healthSessions": ended.map { $0["sessionId"] as? String ?? "" },
  "endCalls": trackedSession?.endCount ?? 0,
  "status": manager.status,
  "lateStartAllowed": WatchSessionIdentity.shouldStart("test-session", recording: false, closedIds: manager.defaults.stringArray(forKey: "watch.closedSessions") ?? []),
]
result.merge(extra) { _, new in new }
print(String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
