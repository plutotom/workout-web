import Foundation

let suite = "watch-snapshot-test-\(UUID().uuidString)"
let defaults = UserDefaults(suiteName: suite)!
defer { defaults.removePersistentDomain(forName: suite) }
let cache = WatchSessionSnapshotCache(defaults: defaults)
func state(_ id: String, _ status: String) -> [String: Any] {
  ["type": "state", "sessionId": id, "status": status, "reachable": true]
}
var result: [String: Any] = [:]
switch CommandLine.arguments[1] {
case "scoped-failure":
  cache.record(["type": "state", "sessionId": "a", "status": "idle", "accountScope": "account:alice", "startError": "Start refused"])
  let restarted = WatchSessionSnapshotCache(defaults: defaults)
  result = ["events": restarted.events()]
case "restart-recording":
  cache.record(state("a", "recording"))
  cache.record(state("", "reachable"))
  cache.record(state("a", "starting"))
  let restarted = WatchSessionSnapshotCache(defaults: defaults)
  result = ["status": restarted.status(for: "a") ?? "", "events": restarted.events()]
case "terminal-order":
  cache.record(state("a", "recording"))
  cache.record(["type": "ended", "sessionId": "a", "healthUuid": "health-a"])
  cache.record(state("a", "recording"))
  cache.record(["type": "ended", "sessionId": "a", "healthUuid": ""])
  let restarted = WatchSessionSnapshotCache(defaults: defaults)
  result = ["status": restarted.status(for: "a") ?? "", "events": restarted.events()]
case "locked-save":
  cache.record(["type": "ended", "sessionId": "a", "healthUuid": "", "healthSaved": true])
  cache.record(["type": "ended", "sessionId": "a", "healthUuid": "", "healthSaved": false])
  let restarted = WatchSessionSnapshotCache(defaults: defaults)
  result = ["events": restarted.events()]
case "save-retry":
  cache.record(state("a", "saving"))
  cache.record(state("a", "recording"))
  cache.record(state("a", "saveFailed"))
  cache.record(state("a", "starting"))
  let restarted = WatchSessionSnapshotCache(defaults: defaults)
  result = ["failed": restarted.status(for: "a") ?? ""]
  restarted.record(state("a", "saving"))
  result["retry"] = restarted.status(for: "a") ?? ""
case "metrics":
  cache.record(state("a", "recording"))
  cache.record(["type": "metrics", "sessionId": "a", "heartRate": 110.0, "activeEnergyKcal": Double.nan])
  cache.record(["type": "metrics", "sessionId": "unknown", "heartRate": 199.0])
  result = ["live": cache.events(), "afterRestart": WatchSessionSnapshotCache(defaults: defaults).events()]
case "bounded-history":
  for index in 0..<30 { cache.record(state("session-\(index)", "recording")) }
  result = ["events": cache.events(), "latest": cache.latestSessionId() ?? ""]
case "command-ownership":
  result = [
    "matches": WatchSessionIdentity.matchesCommand("a", currentId: "a"),
    "other": WatchSessionIdentity.matchesCommand("old", currentId: "a"),
    "empty": WatchSessionIdentity.matchesCommand("", currentId: "a"),
    "legacy": WatchSessionIdentity.matchesCommand(nil, currentId: "a"),
    "freshStart": WatchSessionIdentity.shouldStart("a", recording: false, closedIds: []),
    "repeatedStart": WatchSessionIdentity.shouldStart("a", recording: true, closedIds: []),
    "lateStart": WatchSessionIdentity.shouldStart("a", recording: false, closedIds: ["a"]),
    "emptyStart": WatchSessionIdentity.shouldStart("", recording: false, closedIds: []),
  ]
default: fatalError("Unknown scenario")
}
print(String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
