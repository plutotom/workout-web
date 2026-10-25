import Foundation

enum Identifier { case heartRate, activeEnergyBurned }
struct HKObjectType: Hashable {
  let name: String
  static func workoutType() -> HKObjectType { HKObjectType(name: "workout") }
  static func quantityType(forIdentifier id: Identifier) -> HKObjectType? {
    HKObjectType(name: id == .heartRate ? "heartRate" : "activeEnergyBurned")
  }
}
typealias HKQuantityType = HKObjectType
enum RequestFailure: Error { case unavailable }
@MainActor final class HKHealthStore {
  var calls = 0
  var read: Set<HKObjectType> = [.workoutType()]
  var share: Set<HKObjectType> = [.workoutType()]
  var fail = false
  var pause = false
  var pending: CheckedContinuation<Void, Never>?
  func requestAuthorization(toShare: Set<HKObjectType>, read: Set<HKObjectType>) async throws {
    calls += 1
    self.share = toShare
    self.read = read
    if pause { await withCheckedContinuation { pending = $0 } }
    if fail { throw RequestFailure.unavailable }
    // Success only means the request completed, including when reads are denied.
  }
}
final class HKLiveWorkoutDataSource {
  let configuration: Int
  init(healthStore: HKHealthStore, workoutConfiguration: Int) { configuration = workoutConfiguration }
}
final class HKLiveWorkoutBuilder {
  var delegate: AnyObject?
  var dataSource: HKLiveWorkoutDataSource?
}
final class HKWorkoutSession {
  var delegate: AnyObject?
  let workoutConfiguration = 42
  let builder = HKLiveWorkoutBuilder()
  func associatedWorkoutBuilder() -> HKLiveWorkoutBuilder { builder }
}
@MainActor final class Manager {
  let healthStore = HKHealthStore()
  var requestingHealthAccess = false
  var healthAccessError: String?
  var session: HKWorkoutSession?
  var builder: HKLiveWorkoutBuilder?
  var sessionId = ""
  // WATCH_AUTHORIZATION
  // WATCH_REVIEW
  // WATCH_ATTACH
  func attachRecovered(_ session: HKWorkoutSession) { attach(session: session, sessionId: "recovered") }
}
@MainActor final class Phone {
  let healthStore = HKHealthStore()
  // PHONE_AUTHORIZATION
}
@main struct Main {
  @MainActor static func main() async throws {
    let manager = Manager()
    let store = manager.healthStore
    var result: [String: Any] = [:]
    switch CommandLine.arguments[1] {
    case "phone", "watch":
      let actual: HKHealthStore
      if CommandLine.arguments[1] == "phone" {
        let phone = Phone()
        try await phone.startWatchWorkout(sessionId: "test", startedAt: 0, syncIdentifier: "test")
        actual = phone.healthStore
      } else {
        await manager.reviewHealthAccess()
        actual = store
      }
      result = ["read": actual.read.map(\.name).sorted(), "share": actual.share.map(\.name).sorted(), "calls": actual.calls]
    case "retry":
      store.fail = true
      await manager.reviewHealthAccess()
      let failed = manager.healthAccessError != nil
      store.fail = false
      await manager.reviewHealthAccess()
      result = ["failed": failed, "retried": manager.healthAccessError == nil, "requesting": manager.requestingHealthAccess, "calls": store.calls]
    case "overlap":
      store.pause = true
      let first = Task { await manager.reviewHealthAccess() }
      while store.pending == nil { await Task.yield() }
      await manager.reviewHealthAccess()
      store.pending?.resume()
      await first.value
      result = ["calls": store.calls, "requesting": manager.requestingHealthAccess]
    case "recovery":
      let session = HKWorkoutSession()
      manager.attachRecovered(session)
      result = ["attached": manager.session === session && manager.builder === session.builder && session.delegate === manager && session.builder.delegate === manager,
                "configuration": session.builder.dataSource?.configuration ?? -1, "sessionId": manager.sessionId]
    default: fatalError("Unknown scenario")
    }
    print(String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
  }
}
