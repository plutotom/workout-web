import Foundation

/// Retain lifecycle acknowledgements even while the React tree/process is gone.
/// Metrics stay in memory; only small state/Health UUID records reach disk.
final class WatchSessionSnapshotCache {
  private let defaults: UserDefaults
  private let key = "watch.sessionSnapshots.v1"
  private let lock = NSLock()
  private var order: [String] = []
  private var states: [String: [String: Any]] = [:]
  private var endings: [String: [String: Any]] = [:]
  private var metrics: [String: [String: Any]] = [:]
  private var activeSessionId = ""

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    for event in defaults.array(forKey: key) as? [[String: Any]] ?? [] {
      record(event, persist: false)
    }
  }

  func events() -> [[String: Any]] {
    lock.lock()
    defer { lock.unlock() }
    return order.flatMap { id in [states[id], metrics[id], endings[id]].compactMap { $0 } }
  }

  func latestSessionId() -> String? {
    lock.lock()
    defer { lock.unlock() }
    return order.last
  }

  func status(for id: String) -> String? {
    lock.lock()
    defer { lock.unlock() }
    return endings[id] == nil ? states[id]?["status"] as? String : "ended"
  }

  func record(_ event: [String: Any], persist: Bool = true) {
    lock.lock()
    defer { lock.unlock() }
    let type = event["type"] as? String ?? ""
    let id = event["sessionId"] as? String ?? (type == "metrics" ? activeSessionId : "")
    guard !id.isEmpty else { return } // Transport reachability is not lifecycle.
    if type == "metrics" {
      guard states[id] != nil, endings[id] == nil else { return }
      var values: [String: Any] = ["type": type, "sessionId": id]
      for field in ["heartRate", "activeEnergyKcal", "durationSeconds"] {
        if let value = event[field] as? NSNumber, value.doubleValue.isFinite { values[field] = value }
      }
      metrics[id] = values
      return
    }
    if type == "state" {
      guard let status = event["status"] as? String,
            ["idle", "starting", "recording", "recovering", "saving", "saveFailed", "ended", "disconnected"].contains(status),
            endings[id] == nil else { return }
      let current = states[id]?["status"] as? String ?? ""
      if ["recording", "saving", "saveFailed"].contains(current), ["starting", "recovering"].contains(status) { return }
      if ["saving", "saveFailed"].contains(current), status == "recording" { return }
      states[id] = ["type": type, "sessionId": id, "status": status, "reachable": event["reachable"] as? Bool ?? false]
      if ["starting", "recording", "recovering", "saving", "saveFailed"].contains(status) { activeSessionId = id }
    } else if type == "ended" {
      let uuid = event["healthUuid"] as? String ?? ""
      // A delayed discard acknowledgement must not erase an already saved UUID.
      let saved = (endings[id]?["healthUuid"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? uuid
      var ending: [String: Any] = ["type": type, "sessionId": id, "healthUuid": saved]
      if event["healthSaved"] as? Bool == true || endings[id]?["healthSaved"] as? Bool == true || !saved.isEmpty {
        ending["healthSaved"] = true
      }
      endings[id] = ending
      if activeSessionId == id { activeSessionId = "" }
    } else { return }
    if !order.contains(id) { order.append(id) }
    while order.count > 16 {
      let oldest = order.removeFirst()
      states.removeValue(forKey: oldest)
      endings.removeValue(forKey: oldest)
      metrics.removeValue(forKey: oldest)
    }
    if persist {
      defaults.set(order.flatMap { id in [states[id], endings[id]].compactMap { $0 } }, forKey: key)
    }
  }
}
