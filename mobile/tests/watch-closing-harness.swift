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
class HKSample {}
final class HKWorkout: HKSample {
  let uuid = UUID()
  var metadata: [String: Any] = [:]
  var source = "our-watch"
}
typealias TestWorkout = HKWorkout
struct HKObjectType { static func workoutType() -> HKObjectType { HKObjectType() } }
final class HKSource {
  let name = "our-watch"
  static func `default`() -> HKSource { HKSource() }
}
final class HKQuery {
  static func predicateForObject(with uuid: UUID) -> NSPredicate {
    NSPredicate { value, _ in (value as? HKWorkout)?.uuid == uuid }
  }
  static func predicateForObjects(withMetadataKey key: String, allowedValues: [String]) -> NSPredicate {
    NSPredicate { value, _ in guard let value = value as? HKWorkout else { return false }; return allowedValues.contains(value.metadata[key] as? String ?? "") }
  }
  static func predicateForObjects(from source: HKSource) -> NSPredicate {
    NSPredicate { value, _ in (value as? HKWorkout)?.source == source.name }
  }
}
let HKObjectQueryNoLimit = 0
final class HKSampleQuery {
  let predicate: NSPredicate?
  let callback: (HKSampleQuery, [HKSample]?, Error?) -> Void
  init(sampleType: HKObjectType, predicate: NSPredicate?, limit: Int, sortDescriptors: [NSSortDescriptor]?, resultsHandler: @escaping (HKSampleQuery, [HKSample]?, Error?) -> Void) {
    self.predicate = predicate; self.callback = resultsHandler
  }
}
final class HKHealthStore {
  var recovery: ((HKWorkoutSession?, Error?) -> Void)?
  var recoveryCalls = 0
  var storedWorkouts: [HKWorkout] = []
  var queryCount = 0
  var deleteCount = 0
  var failQuery = false
  var emptyQuery = false
  var failDelete = false
  var deferQuery = false
  var pendingQuery: HKSampleQuery?
  func recoverActiveWorkoutSession(completion: @escaping (HKWorkoutSession?, Error?) -> Void) { recoveryCalls += 1; recovery = completion }
  func completeRecovery(_ session: HKWorkoutSession?, error: Error? = nil) {
    let completion = recovery; recovery = nil; completion?(session, error); drainMainQueue()
  }
  func execute(_ query: HKSampleQuery) {
    queryCount += 1
    pendingQuery = query
    if !deferQuery { completeQuery() }
  }
  func completeQuery() {
    guard let query = pendingQuery else { return }
    pendingQuery = nil
    let found = emptyQuery ? [] : storedWorkouts.filter { query.predicate?.evaluate(with: $0) ?? true }
    query.callback(query, failQuery ? nil : found, failQuery ? NSError(domain: "synthetic-query", code: 1) : nil)
  }
  var deferDeleteCallback = false
  var pendingDeleteCallback: (() -> Void)?
  var deletedCounts: [Int] = []
  func deleteObjects(of type: HKObjectType, predicate: NSPredicate, withCompletion completion: @escaping (Bool, Int, Error?) -> Void) {
    deleteCount += 1
    let found = storedWorkouts.filter { predicate.evaluate(with: $0) }
    let count = failDelete ? 0 : found.count
    if !failDelete { storedWorkouts.removeAll { item in found.contains { $0.uuid == item.uuid } } }
    deletedCounts.append(count)
    let success = !failDelete
    let callback = { completion(success, count, success ? nil : NSError(domain: "synthetic-delete", code: 1)) }
    if deferDeleteCallback { pendingDeleteCallback = callback } else { callback() }
  }
}
let HKMetadataKeySyncIdentifier = "sync"
let HKMetadataKeySyncVersion = "version"
final class HKLiveWorkoutDataSource {
  init(healthStore: HKHealthStore, workoutConfiguration: HKWorkoutConfiguration) {}
}
final class HKWorkoutSession {
  var state: SessionState = .notStarted
  var endCount = 0
  var delegate: AnyObject?
  let workoutConfiguration: HKWorkoutConfiguration
  let builder: HKLiveWorkoutBuilder
  var startDate: Date?
  init(healthStore: HKHealthStore, configuration: HKWorkoutConfiguration) throws { workoutConfiguration = configuration; builder = HKLiveWorkoutBuilder(store: healthStore) }
  func associatedWorkoutBuilder() -> HKLiveWorkoutBuilder { builder }
  func startActivity(with date: Date) { startDate = date; state = .running }
  func end() { endCount += 1 }
}
final class HKLiveWorkoutBuilder {
  let store: HKHealthStore
  var metadata: [String: Any] = [:]
  var failMetadata = false
  init(store: HKHealthStore) { self.store = store }
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
  func addMetadata(_ values: [String: Any], completion: (Bool, Error?) -> Void) {
    if !failMetadata { metadata.merge(values) { _, new in new } }
    completion(!failMetadata, failMetadata ? NSError(domain: "synthetic-metadata", code: 1) : nil)
  }
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
    let workout = HKWorkout()
    workout.metadata = metadata
    if !failSave { savedCount += 1; store.storedWorkouts.append(workout) }
    saveCompletion?(failSave || locked ? nil : workout, failSave ? NSError(domain: "synthetic", code: 1) : nil)
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
  var reconciliationAttempt: UUID?
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
  if scenario == "stale-save-callback" { trackedBuilder!.completeSave(); drainMainQueue() }
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
    manager.retryWorkoutOperation(); drainMainQueue()
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
case "delete-callback-lost":
  trackedBuilder!.deferSave = true
  manager.healthStore.deferDeleteCallback = true
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection()
  manager.discard(); trackedBuilder!.completeSave(); drainMainQueue()
  extra["phaseBeforeRestart"] = manager.defaults.dictionary(forKey: "watch.finalization")?["phase"] as? String ?? "missing"
  extra["ackBeforeRestart"] = PhoneBridge.shared.events.contains { $0["type"] as? String == "ended" }
  let restarted = TestManager(); restarted.defaults = manager.defaults
  restarted.healthStore.storedWorkouts = manager.healthStore.storedWorkouts
  restarted.healthStore.failQuery = true // Replay must not depend on reading a surviving object.
  manager = restarted
  manager.startFromPhone(sessionId: "next-session", startedAtMs: 2000, syncIdentifier: "next")
  manager.healthStore.completeRecovery(nil)
  extra["newSessionId"] = manager.sessionId
  extra["deleteReplayCounts"] = manager.healthStore.deletedCounts
  extra["queryCount"] = manager.healthStore.queryCount
case "recovery-error-scoped", "recovery-error-no-context":
  if scenario == "recovery-error-scoped" { manager.defaults.set("test-session", forKey: "watch.sessionId") }
  manager.endFromPhone(sessionId: "test-session", discard: false)
  manager.healthStore.completeRecovery(nil, error: NSError(domain: "synthetic", code: 9))
  extra["failureWasScoped"] = PhoneBridge.shared.events.contains { $0["type"] as? String == "state" && $0["sessionId"] as? String == "test-session" && $0["status"] as? String == "recoveryFailed" }
  extra["recoveryGateRetained"] = manager.recoveryPending
  extra["closureRetained"] = manager.defaults.dictionary(forKey: "watch.pendingEnds")?["test-session"] as? Bool == false
  manager.retryFromPhone(sessionId: "test-session")
  manager.healthStore.completeRecovery(nil, error: NSError(domain: "synthetic", code: 9))
  extra["recoveryCalls"] = manager.healthStore.recoveryCalls
case "recovery-end-date", "recovery-end-date-retry":
  manager.defaults.set("test-session", forKey: "watch.sessionId")
  manager.defaults.set("test", forKey: "watch.syncIdentifier")
  manager.defaults.set(["sessionId": "test-session", "syncIdentifier": "test", "startedAt": 100.0, "endedAt": 200.0, "phase": "ending", "discard": false], forKey: "watch.finalization")
  manager.defaults.set(["test-session": false], forKey: "watch.pendingEnds")
  let recovered = try HKWorkoutSession(healthStore: manager.healthStore, configuration: HKWorkoutConfiguration())
  recovered.startActivity(with: Date(timeIntervalSince1970: 100))
  manager.recoverIfNeeded(); manager.healthStore.completeRecovery(recovered)
  trackedBuilder = recovered.builder; trackedSession = recovered
  manager.deliverEnded()
  if scenario == "recovery-end-date-retry" {
    trackedBuilder!.completeCollection(success: false)
    manager.retryWorkoutOperation()
  }
  extra["recoveredEndDate"] = trackedBuilder!.requestedEndDate?.timeIntervalSince1970 ?? -1
  trackedBuilder!.completeCollection()
case "recovery-start-error-retry":
  manager.startFromPhone(sessionId: "test-session", startedAtMs: 1000, syncIdentifier: "test")
  manager.healthStore.completeRecovery(nil, error: NSError(domain: "synthetic", code: 9))
  manager.retryFromPhone(sessionId: "test-session")
  manager.healthStore.completeRecovery(nil)
  extra["startedAfterRetry"] = manager.session != nil && manager.sessionId == "test-session"
  extra["pendingCloseCount"] = (manager.defaults.dictionary(forKey: "watch.pendingEnds") ?? [:]).count
case "retry-foreign-session":
  manager.retryFromPhone(sessionId: "another-session")
case "interrupted-ending", "interrupted-collection", "interrupted-save", "interrupted-committed", "interrupted-discard":
  trackedBuilder!.deferSave = true
  manager.end()
  extra["journalBeforeSessionEnd"] = manager.defaults.dictionary(forKey: "watch.finalization")?["phase"] as? String == "ending"
  if scenario != "interrupted-ending" { manager.deliverEnded() }
  if ["interrupted-save", "interrupted-committed", "interrupted-discard"].contains(scenario) { trackedBuilder!.completeCollection() }
  if scenario == "interrupted-discard" { manager.discard() }
  if scenario == "interrupted-committed" || scenario == "interrupted-discard" {
    let committed = HKWorkout(); committed.metadata = trackedBuilder!.metadata
    manager.healthStore.storedWorkouts.append(committed) // Health commit, callback lost.
  }
  let restarted = TestManager()
  restarted.defaults = manager.defaults
  restarted.healthStore.storedWorkouts = manager.healthStore.storedWorkouts
  PhoneBridge.shared.events.removeAll()
  manager = restarted
  manager.recoverIfNeeded(); manager.healthStore.completeRecovery(nil)
  extra["interruptedPhase"] = manager.defaults.dictionary(forKey: "watch.finalization")?["phase"] as? String ?? "cleared"
  extra["pendingCloseCount"] = (manager.defaults.dictionary(forKey: "watch.pendingEnds") ?? [:]).count
  extra["errorVisible"] = manager.workoutError != nil
  extra["queryCount"] = manager.healthStore.queryCount
case "discard-in-save", "discard-locked-save", "discard-delete-retry":
  trackedBuilder!.deferSave = true
  trackedBuilder!.locked = scenario == "discard-locked-save"
  manager.healthStore.emptyQuery = scenario == "discard-locked-save"
  manager.healthStore.failDelete = scenario == "discard-delete-retry" || scenario == "discard-locked-save"
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection()
  extra["saveWasInFlight"] = manager.saveInFlight
  manager.discard()
  trackedBuilder!.completeSave(); drainMainQueue()
  if scenario != "discard-in-save" {
    extra["ackBeforeRetry"] = PhoneBridge.shared.events.contains { $0["type"] as? String == "ended" }
    extra["discardRetainedBeforeRetry"] = manager.defaults.dictionary(forKey: "watch.finalization")?["discard"] as? Bool == true
    manager.healthStore.emptyQuery = false; manager.healthStore.failDelete = false
    manager.endFromPhone(sessionId: "test-session", discard: false); drainMainQueue()
  }
case "phone-journal-recovery-retry":
  trackedBuilder!.failSave = true
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection()
  let restarted = TestManager(); restarted.defaults = manager.defaults
  manager = restarted
  manager.recoverIfNeeded(); manager.healthStore.completeRecovery(nil)
  let callsBefore = manager.healthStore.recoveryCalls
  PhoneBridge.shared.events.removeAll()
  manager.endFromPhone(sessionId: "test-session", discard: false)
  manager.healthStore.completeRecovery(nil)
  extra["recoveryCallsFromPhone"] = manager.healthStore.recoveryCalls - callsBefore
  extra["statesAfterRetry"] = PhoneBridge.shared.events.filter { $0["type"] as? String == "state" }.map { $0["status"] as? String ?? "" }
case "reconcile-query-retry":
  trackedBuilder!.deferSave = true
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection()
  let committed = HKWorkout(); committed.metadata = trackedBuilder!.metadata
  let restarted = TestManager(); restarted.defaults = manager.defaults
  restarted.healthStore.storedWorkouts = [committed]; restarted.healthStore.failQuery = true
  manager = restarted
  manager.recoverIfNeeded(); manager.healthStore.completeRecovery(nil)
  extra["ackBeforeRetry"] = PhoneBridge.shared.events.contains { $0["type"] as? String == "ended" }
  extra["phaseAfterQueryError"] = manager.defaults.dictionary(forKey: "watch.finalization")?["phase"] as? String ?? "missing"
  manager.healthStore.failQuery = false
  manager.endFromPhone(sessionId: "test-session", discard: false); drainMainQueue()
case "phone-recovery-retry":
  // Legacy failure without a journal must remain compatible with old candidates.
  manager.session = nil; manager.builder = nil; manager.status = "saveFailed"
  manager.defaults.set("test-session", forKey: "watch.failedSaveSessionId")
  let callsBefore = manager.healthStore.recoveryCalls
  PhoneBridge.shared.events.removeAll()
  manager.endFromPhone(sessionId: "test-session", discard: false)
  manager.healthStore.completeRecovery(nil)
  extra["recoveryCallsFromPhone"] = manager.healthStore.recoveryCalls - callsBefore
  extra["statesAfterRetry"] = PhoneBridge.shared.events.filter { $0["type"] as? String == "state" }.map { $0["status"] as? String ?? "" }
case "metadata-retry":
  trackedBuilder!.failMetadata = true
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection()
  extra["savesBeforeRetry"] = trackedBuilder!.saveCount
  trackedBuilder!.failMetadata = false
  manager.retryWorkoutOperation(); drainMainQueue()
case "reconcile-source-scope":
  trackedBuilder!.deferSave = true
  manager.end(); manager.deliverEnded(); trackedBuilder!.completeCollection()
  let foreign = HKWorkout(); foreign.metadata = trackedBuilder!.metadata; foreign.source = "another-app"
  let different = HKWorkout(); different.metadata = [HKMetadataKeySyncIdentifier: "another-workout"]
  let ours = HKWorkout(); ours.metadata = trackedBuilder!.metadata
  manager.healthStore.storedWorkouts = [foreign, different, ours]
  let restarted = TestManager(); restarted.defaults = manager.defaults
  restarted.healthStore.storedWorkouts = manager.healthStore.storedWorkouts
  restarted.defaults.set(["test-session": true], forKey: "watch.pendingEnds")
  manager = restarted
  manager.recoverIfNeeded(); manager.healthStore.completeRecovery(nil)
  extra["foreignPreserved"] = manager.healthStore.storedWorkouts.contains { $0.uuid == foreign.uuid }
  extra["differentPreserved"] = manager.healthStore.storedWorkouts.contains { $0.uuid == different.uuid }
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
drainMainQueue()
let ended = PhoneBridge.shared.events.filter { $0["type"] as? String == "ended" }
var result: [String: Any] = [
  "saves": trackedBuilder?.saveCount ?? 0,
  "remainingHealthWorkouts": manager.healthStore.storedWorkouts.count,
  "healthDeleteCalls": manager.healthStore.deleteCount,
  "finalizationRetained": manager.defaults.dictionary(forKey: "watch.finalization") != nil,
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
