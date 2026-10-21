import Foundation

// Only HealthKit I/O is simulated. The manager's closing methods are inserted
// from WorkoutManager.swift by watch-closing.test.mjs.
enum SessionState { case running, stopped, ended }

final class TestSession {
  var state: SessionState = .running
  var endCount = 0
  func end() { endCount += 1 }
}

final class TestWorkout {
  let uuid = UUID()
}

final class TestBuilder {
  var discardCount = 0
  var saveCount = 0
  var endCollectionCount = 0
  var collectionCompletion: ((Bool, Error?) -> Void)?

  func discardWorkout() { discardCount += 1 }

  func endCollection(withEnd: Date, completion: @escaping (Bool, Error?) -> Void) {
    endCollectionCount += 1
    collectionCompletion = completion
  }

  func finishWorkout(completion: (TestWorkout?, Error?) -> Void) {
    saveCount += 1
    completion(TestWorkout(), nil)
  }

  func completeCollection() {
    let completion = collectionCompletion
    collectionCompletion = nil
    completion?(true, nil)
    drainMainQueue()
  }
}

final class TestDefaults {
  var values: [String: Any] = [:]
  func stringArray(forKey key: String) -> [String]? { values[key] as? [String] }
  func dictionary(forKey key: String) -> [String: Any]? { values[key] as? [String: Any] }
  func set(_ value: Any, forKey key: String) { values[key] = value }
  func removeObject(forKey: String) {}
}

final class PhoneBridge {
  static let shared = PhoneBridge()
  var events: [[String: Any]] = []
  func send(_ payload: [String: Any]) { events.append(payload) }
}

final class TestManager {
  var session: TestSession? = TestSession()
  var builder: TestBuilder? = TestBuilder()
  var status = "recording"
  var sessionId = "test-session"
  var heartRate: Double? = 100
  var activeEnergyKcal: Double? = 10
  var discardOnEnd = false
  var isClosing = false
  let defaults = TestDefaults()

  func mirrorState() {}
  func stopTicking() {}
  func end() { requestEnd(discard: false) }
  func discard() { requestEnd(discard: true) }
  func deliverEnded() {
    session?.state = .ended
    handleSessionEnded(date: Date())
  }

  // WORKOUT_MANAGER_CLOSING_METHODS
}

func drainMainQueue() {
  RunLoop.main.run(until: Date().addingTimeInterval(0.02))
}

let manager = TestManager()
let builder = manager.builder!
let session = manager.session!

switch CommandLine.arguments[1] {
case "foreign-end":
  manager.endFromPhone(sessionId: "old-session", discard: false)
case "finish-before-start":
  manager.session = nil
  manager.builder = nil
  manager.sessionId = ""
  manager.endFromPhone(sessionId: "test-session", discard: false)
case "discard-then-end":
  manager.discard()
  manager.end()
  manager.deliverEnded()
  builder.completeCollection()
case "discard-during-collection":
  manager.end()
  manager.deliverEnded()
  manager.discard()
  builder.completeCollection()
case "discard-after-collection-callback":
  manager.end()
  manager.deliverEnded()
  // HealthKit's callback has fired, but its main-queue task has not run yet.
  builder.collectionCompletion?(true, nil)
  manager.discard()
  drainMainQueue()
case "normal-end":
  manager.end()
  manager.deliverEnded()
  builder.completeCollection()
case "repeated-discard":
  manager.discard()
  manager.discard()
  manager.deliverEnded()
  manager.deliverEnded()
  manager.discard()
  builder.completeCollection()
case "repeated-end":
  manager.end()
  manager.deliverEnded()
  manager.end()
  manager.deliverEnded()
  builder.completeCollection()
default:
  fatalError("Unknown test scenario")
}

let ended = PhoneBridge.shared.events.filter { $0["type"] as? String == "ended" }
let result: [String: Any] = [
  "saves": builder.saveCount,
  "discards": builder.discardCount,
  "collections": builder.endCollectionCount,
  "released": manager.session == nil && manager.builder == nil,
  "healthUuids": ended.map { $0["healthUuid"] as? String ?? "" },
  "healthSessions": ended.map { $0["sessionId"] as? String ?? "" },
  "endCalls": session.endCount,
  "lateStartAllowed": WatchSessionIdentity.shouldStart("test-session", recording: false, closedIds: manager.defaults.stringArray(forKey: "watch.closedSessions") ?? []),
]
let data = try JSONSerialization.data(withJSONObject: result)
print(String(data: data, encoding: .utf8)!)
