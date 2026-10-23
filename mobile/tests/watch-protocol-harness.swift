import Foundation

enum ActivationState { case activated }
final class WCSession {
  static let `default` = WCSession()
  static func isSupported() -> Bool { true }
  let activationState = ActivationState.activated
}
final class Exception: Error { init(name: String, description: String) {} }
final class PhoneCommands {
  let journal: WatchRecordingJournal
  var accountScope: String? = "alice"
  var commands: [[String: Any]] = []
  init(_ journal: WatchRecordingJournal) { self.journal = journal }
  func send(_ payload: [String: Any]) { commands.append(payload) }
  func close(sessionId: String, endedAt: Double, discard: Bool, scope: String) throws {
    commands.append(contentsOf: try journal.close(appId: sessionId, discard: discard, endedAt: endedAt, scope: scope))
  }
  // PHONE_COMMAND_METHOD
}

let suite = "watch-protocol-test-\(UUID().uuidString)"
let defaults = UserDefaults(suiteName: suite)!
let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(suite).appendingPathComponent("attempts.json")
defer {
  defaults.removePersistentDomain(forName: suite)
  try? FileManager.default.removeItem(at: fileURL.deletingLastPathComponent())
}
var journal = WatchRecordingJournal(defaults: defaults, fileURL: fileURL)
let scenario = CommandLine.arguments[1]
func offer(_ app: String, now: Double = 1000) -> String {
  try! journal.offer(appId: app, syncIdentifier: "health-\(app)", scope: "alice", now: now)
}
func start(_ packet: [String: Any]) -> [String: Any]? { packet["start"] as? [String: Any] }
var result: [String: Any] = [:]
switch scenario {
case "timeout-before-admission":
  let id = offer("A")
  let released = try journal.launchFailed(id)
  journal = WatchRecordingJournal(defaults: defaults, fileURL: fileURL)
  result = ["released": released, "offeredTomorrow": start(try journal.handshake(scope: "alice", now: 86_400_000)) != nil]
case "timeout-after-admission":
  let id = offer("A")
  _ = try journal.handshake(scope: "alice", now: 2000)
  let released = try journal.launchFailed(id)
  journal = WatchRecordingJournal(defaults: defaults, fileURL: fileURL)
  let event = journal.observe(["type": "state", "sessionId": id, "status": "idle"])
  result = ["released": released, "wireIdRetained": journal.pendingIds().contains(id), "mappedStatus": event["status"] ?? ""]
case "next-day":
  let a = offer("A")
  _ = try journal.handshake(scope: "alice", now: 1500)
  _ = try journal.close(appId: "A", discard: false, endedAt: 2000, scope: "alice")
  _ = try journal.close(appId: "A", discard: false, endedAt: 86_400_000, scope: "alice")
  journal = WatchRecordingJournal(defaults: defaults, fileURL: fileURL)
  let survived = journal.closurePayloads().contains { $0["sessionId"] as? String == a }
  let b = offer("B", now: 86_400_000)
  let packet = try journal.handshake(scope: "alice", now: 86_400_001)
  let closures = packet["closures"] as? [[String: Any]] ?? []
  result = ["startIsB": start(packet)?["sessionId"] as? String == b, "closeIsA": closures.first?["sessionId"] as? String == a,
            "endedAt": closures.first?["endedAt"] ?? 0, "closureSurvivedRestart": survived]
case "retry":
  let old = offer("A")
  _ = try journal.handshake(scope: "alice", now: 1500)
  let first = journal.observe(["type": "ended", "sessionId": old, "healthUuid": ""])
  let next = offer("A", now: 2000)
  let packet = try journal.handshake(scope: "alice", now: 2001)
  result = ["newIdentity": old != next, "sameHealthIdentity": start(packet)?["syncIdentifier"] as? String == "health-A", "oldResultApp": first["sessionId"] ?? ""]
case "duplicate-start":
  let a = offer("A"), b = offer("A")
  result = ["sameAttempt": a == b, "pending": journal.pendingIds().count]
case "expiry":
  let a = offer("A"), b = offer("B", now: 1001)
  _ = try journal.handshake(scope: "alice", now: 1500)
  // Exactly one invitation was admitted; the other may expire safely.
  journal = WatchRecordingJournal(defaults: defaults, fileURL: fileURL)
  let expired = try journal.expireUnadmitted(now: 86_400_000).map { journal.observe(["type": "state", "sessionId": $0])["sessionId"] as? String ?? "" }
  let admitted = journal.pendingIds()
  result = ["expiredApps": expired.sorted(), "admittedStillPending": admitted.count == 1 && (admitted.contains(a) || admitted.contains(b)),
            "oldOfferAbsent": start(try journal.handshake(scope: "alice", now: 86_400_000)) == nil]
case "account-switch":
  let a = offer("A")
  try journal.retireOtherScopes("bob", now: 3000)
  let packet = try journal.handshake(scope: "bob", now: 3001)
  let closures = packet["closures"] as? [[String: Any]] ?? []
  result = ["offered": start(packet) != nil, "closeIsA": closures.first?["sessionId"] as? String == a, "endedAt": closures.first?["endedAt"] ?? 0]
case "storage-failure":
  let a = offer("A")
  let savedURL = fileURL.deletingLastPathComponent().appendingPathComponent("saved.json")
  try FileManager.default.moveItem(at: fileURL, to: savedURL)
  try FileManager.default.createDirectory(at: fileURL, withIntermediateDirectories: true)
  var granted = false, threw = false
  do { granted = start(try journal.handshake(scope: "alice", now: 2000)) != nil } catch { threw = true }
  try FileManager.default.removeItem(at: fileURL)
  try FileManager.default.moveItem(at: savedURL, to: fileURL)
  result = ["granted": granted, "threw": threw, "remainedUnadmitted": try journal.launchFailed(a)]
case "corrupt-storage":
  _ = offer("A")
  try Data("corrupt".utf8).write(to: fileURL)
  journal = WatchRecordingJournal(defaults: defaults, fileURL: fileURL)
  var offered = false, granted = false
  do { _ = try journal.offer(appId: "B", syncIdentifier: "B", scope: "alice", now: 2000); offered = true } catch {}
  do { granted = start(try journal.handshake(scope: "alice", now: 2000)) != nil } catch {}
  result = ["offered": offered, "granted": granted, "untouched": try String(contentsOf: fileURL, encoding: .utf8) == "corrupt"]
case "cross-account-identity":
  let a = offer("A")
  let commands = try journal.close(appId: "A", discard: true, endedAt: 2000, scope: "bob")
  let event = journal.observe(["type": "state", "sessionId": a, "status": "recording"])
  result = ["commands": commands.count, "owner": event["accountScope"] ?? "", "stillPending": journal.pendingIds().contains(a)]
case "expired-active-recovery":
  let a = offer("A")
  _ = try journal.handshake(scope: "alice", now: 1500)
  let packet = try journal.handshake(scope: "alice", now: 86_400_000, watchActiveId: a, recoveryComplete: true)
  result = ["closures": (packet["closures"] as? [[String: Any]] ?? []).count, "released": try journal.launchFailed(a), "pending": journal.pendingIds().count]
case "expired-no-active-recovery":
  let a = offer("A")
  _ = try journal.handshake(scope: "alice", now: 1500)
  let unknown = try journal.handshake(scope: "alice", now: 86_400_000)
  let resolved = try journal.handshake(scope: "alice", now: 86_400_000, watchActiveId: "", recoveryComplete: true)
  let event = journal.observe(["type": "ended", "sessionId": a, "healthUuid": ""])
  result = ["closuresBeforeRecovery": (unknown["closures"] as? [[String: Any]] ?? []).count,
            "closuresAfterRecovery": (resolved["closures"] as? [[String: Any]] ?? []).count, "statusAfterCancellation": event["status"] ?? ""]
case "scoped-retry":
  let a = offer("A")
  _ = try journal.handshake(scope: "alice", now: 1500)
  let phone = PhoneCommands(journal)
  try phone.sendCommand(["type": "retry", "sessionId": "A"])
  let correct = phone.commands.first?["sessionId"] as? String == a
  let wakes = phone.commands.contains { $0["type"] as? String == "wake" }
  phone.commands.removeAll(); phone.accountScope = "bob"
  try phone.sendCommand(["type": "retry", "sessionId": "A"])
  result = ["correctAttempt": correct, "wakesRecovery": wakes, "otherAccountCommands": phone.commands.count]
case "rejected":
  let a = offer("A")
  _ = try journal.handshake(scope: "alice", now: 1500)
  let rejected = journal.observe(["type": "ended", "sessionId": a, "healthUuid": ""])
  let b = offer("B", now: 2000)
  _ = try journal.handshake(scope: "alice", now: 2001)
  let saved = journal.observe(["type": "ended", "sessionId": b, "healthUuid": "health-b", "healthSaved": true])
  result = ["rejectionStatus": rejected["status"] ?? "", "savedType": saved["type"] ?? "", "savedApp": saved["sessionId"] ?? "", "healthUuid": saved["healthUuid"] ?? ""]
case "metrics-read-only":
  let a = offer("A")
  _ = try journal.handshake(scope: "alice", now: 1500)
  _ = journal.observe(["type": "state", "sessionId": a, "status": "recording"])
  let sentinel = Date(timeIntervalSince1970: 1000)
  try FileManager.default.setAttributes([.modificationDate: sentinel], ofItemAtPath: fileURL.path)
  for _ in 0..<100 {
    _ = journal.observe(["type": "metrics", "sessionId": a, "heartRate": 100])
    _ = journal.observe(["type": "state", "sessionId": a, "status": "recording"])
  }
  let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
  result = ["journalUntouched": attributes[.modificationDate] as? Date == sentinel]
case "finish-before-offer":
  let commands = try journal.close(appId: "A", discard: false, endedAt: 2000, scope: "alice")
  journal = WatchRecordingJournal(defaults: defaults, fileURL: fileURL)
  var offered = false
  do { _ = try journal.offer(appId: "A", syncIdentifier: "health-A", scope: "alice", now: 3000); offered = true } catch {}
  result = ["queuedCommands": commands.count, "offeredAfterFinish": offered]
case "guest-adoption":
  let a = try journal.offer(appId: "A", syncIdentifier: "health-A", scope: "guest", now: 1000)
  _ = try journal.handshake(scope: "guest", now: 1500)
  try journal.adoptGuestWorkouts(["A"], scope: "account:alice")
  try journal.retireOtherScopes("account:alice", now: 2000)
  journal = WatchRecordingJournal(defaults: defaults, fileURL: fileURL)
  let event = journal.observe(["type": "state", "sessionId": a, "status": "recording"])
  result = ["owner": event["accountScope"] ?? "", "appId": event["sessionId"] ?? "", "pendingClosures": journal.closurePayloads().count]
case "old-rejection-after-retry":
  let a = offer("A")
  _ = try journal.handshake(scope: "alice", now: 1500)
  _ = journal.observe(["type": "ended", "sessionId": a, "healthUuid": ""])
  _ = offer("A", now: 2000)
  _ = try journal.handshake(scope: "alice", now: 2001)
  let event = journal.observe(["type": "ended", "sessionId": a, "healthUuid": ""])
  result = ["status": event["status"] ?? "", "pending": journal.pendingIds().count]
default: fatalError("Unknown scenario")
}
print(String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
