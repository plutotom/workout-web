import Foundation

/// Durable recording attempts are separate from app workout ids. A failed
/// invitation can be retried without reopening a closed native recording.
final class WatchRecordingJournal {
  private let defaults: UserDefaults
  private let fileURL: URL?
  private var storageHealthy = true
  enum StorageError: Error { case unreadableJournal, workoutAlreadyClosed }
  private let key = "watch.recordingAttempts.v2"
  private let lock = NSRecursiveLock()
  private var records: [String: [String: Any]]
  private var committedRecords: [String: [String: Any]] = [:]

  init(defaults: UserDefaults = .standard, fileURL: URL? = nil) {
    self.defaults = defaults
    self.fileURL = fileURL
    records = defaults.dictionary(forKey: key) as? [String: [String: Any]] ?? [:]
    if let fileURL, FileManager.default.fileExists(atPath: fileURL.path) {
      do {
        let value = try JSONSerialization.jsonObject(with: Data(contentsOf: fileURL))
        guard let saved = value as? [String: [String: Any]] else { throw StorageError.unreadableJournal }
        records = saved
      } catch { storageHealthy = false }
    }
    committedRecords = records
  }

  private func persist() throws {
    do {
    guard storageHealthy else { throw StorageError.unreadableJournal }
    if let fileURL {
      try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
      let data = try JSONSerialization.data(withJSONObject: records)
      #if os(iOS)
      try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      #else
      try data.write(to: fileURL, options: .atomic)
      #endif
    } else {
      defaults.set(records, forKey: key)
    }
    committedRecords = records
    } catch {
      records = committedRecords
      throw error
    }
  }

  func offer(appId: String, syncIdentifier: String, scope: String, now: Double) throws -> String {
    lock.lock(); defer { lock.unlock() }
    if records.values.contains(where: { $0["appId"] as? String == appId && $0["scope"] as? String == scope && $0["appClosed"] as? Bool == true }) {
      throw StorageError.workoutAlreadyClosed
    }
    if let existing = records.first(where: { $0.value["appId"] as? String == appId && $0.value["scope"] as? String == scope && $0.value["acknowledged"] as? Bool != true }) {
      return existing.key
    }
    let id = UUID().uuidString
    records[id] = ["appId": appId, "scope": scope, "syncIdentifier": syncIdentifier,
                   "requestedAt": now, "expiresAt": now + 45_000,
                   "admitted": false, "acknowledged": false]
    try persist()
    return id
  }

  /// Persist admission BEFORE returning permission to create a Health session.
  func handshake(scope: String?, now: Double, watchActiveId: String? = nil, recoveryComplete: Bool = false) throws -> [String: Any] {
    lock.lock(); defer { lock.unlock() }
    var result: [String: Any] = ["protocolVersion": 2]
    let offered = records.keys.sorted {
      (records[$0]?["requestedAt"] as? Double ?? 0) > (records[$1]?["requestedAt"] as? Double ?? 0)
    }
    for id in offered {
      guard var record = records[id], record["acknowledged"] as? Bool != true,
            record["action"] == nil else { continue }
      // An expired admitted attempt is uncertain. Retire it on the Watch before
      // another attempt can record; never release phone export on elapsed time.
      if (record["expiresAt"] as? Double ?? 0) < now {
        if record["admitted"] as? Bool == true {
          if watchActiveId == id, recoveryComplete {
            record["recorded"] = true
          } else if record["recorded"] as? Bool != true, recoveryComplete {
            record["action"] = "end"; record["endedAt"] = now
            record["expired"] = true
          }
        } else { record["acknowledged"] = true }
        records[id] = record
        continue
      }
      guard let scope, record["scope"] as? String == scope else { continue }
      record["admitted"] = true
      records[id] = record
      result["start"] = ["type": "start", "sessionId": id,
                         "syncIdentifier": record["syncIdentifier"] ?? "",
                         "expiresAt": record["expiresAt"] ?? 0]
      break
    }
    result["closures"] = closurePayloads()
    try persist()
    return result
  }

  func close(appId: String, discard: Bool, endedAt: Double, scope: String, allowLegacy: Bool = false) throws -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    let ids = records.keys.filter { records[$0]?["appId"] as? String == appId && records[$0]?["scope"] as? String == scope }
    // Preserve closure for an installed older Watch recording too.
    let knownOtherAccount = records.values.contains { $0["appId"] as? String == appId && $0["scope"] as? String != scope }
    let legacy = allowLegacy && !knownOtherAccount
    let newIds = ids.isEmpty ? [legacy ? appId : UUID().uuidString] : []
    if let id = newIds.first {
      // A phone-only Finish still fences a late authorization completion, but
      // does not create a WatchConnectivity backlog for a non-existent recording.
      records[id] = ["appId": appId, "scope": scope, "admitted": legacy, "acknowledged": !legacy]
    }
    for id in ids.isEmpty ? newIds : ids {
      guard var record = records[id] else { continue }
      record["appClosed"] = true
      if record["acknowledged"] as? Bool == true { records[id] = record; continue }
      record["action"] = discard || record["action"] as? String == "discard" ? "discard" : "end"
      record["expired"] = false
      record["endedAt"] = min(record["endedAt"] as? Double ?? endedAt, endedAt)
      records[id] = record
    }
    try persist()
    return closurePayloads()
  }

  func launchFailed(_ id: String) throws -> Bool {
    lock.lock(); defer { lock.unlock() }
    guard var record = records[id] else { return false }
    guard record["admitted"] as? Bool != true else { return false }
    record["acknowledged"] = true // No future handshake may admit this attempt.
    records[id] = record
    try persist()
    return true
  }

  func expireUnadmitted(now: Double) throws -> [String] {
    lock.lock(); defer { lock.unlock() }
    var resolved: [String] = []
    for id in Array(records.keys) {
      guard var record = records[id], record["admitted"] as? Bool != true,
            record["acknowledged"] as? Bool != true,
            (record["expiresAt"] as? Double ?? .infinity) < now else { continue }
      record["acknowledged"] = true
      records[id] = record
      resolved.append(id)
    }
    try persist()
    return resolved
  }

  func observe(_ event: [String: Any]) -> [String: Any] {
    lock.lock(); defer { lock.unlock() }
    guard let id = event["sessionId"] as? String, var record = records[id] else { return event }
    let rejected = event["type"] as? String == "ended" && (record["action"] == nil || record["expired"] as? Bool == true) &&
      record["recorded"] as? Bool != true && event["healthSaved"] as? Bool != true &&
      (event["healthUuid"] as? String ?? "").isEmpty
    var changed = false
    if event["type"] as? String == "ended", record["acknowledged"] as? Bool != true {
      record["acknowledged"] = true
      changed = true
    }
    if ["recording", "saving", "saveFailed"].contains(event["status"] as? String ?? ""), record["recorded"] as? Bool != true {
      record["recorded"] = true
      changed = true
    }
    if changed {
      records[id] = record
      try? persist()
    }
    var mapped = event
    mapped["sessionId"] = record["appId"]
    mapped["accountScope"] = record["scope"]
    if rejected {
      mapped = ["type": "state", "sessionId": record["appId"] ?? "", "status": "idle", "reachable": true, "accountScope": record["scope"] ?? ""]
      if let message = event["startError"] as? String { mapped["startError"] = message }
    } else if event["status"] as? String == "idle", record["admitted"] as? Bool == true,
              record["acknowledged"] as? Bool != true {
      mapped["status"] = "recoveryFailed"
    }
    if mapped["status"] as? String == "idle", records.contains(where: {
      $0.key != id && $0.value["appId"] as? String == record["appId"] as? String &&
      $0.value["scope"] as? String == record["scope"] as? String && $0.value["acknowledged"] as? Bool != true
    }) { mapped["status"] = "starting" }
    return mapped
  }

  /// Only SQLite's durable guest-transfer receipt may supply these app ids.
  func adoptGuestWorkouts(_ appIds: [String], scope: String) throws {
    lock.lock(); defer { lock.unlock() }
    let accepted = Set(appIds)
    for id in Array(records.keys) {
      guard var record = records[id], record["scope"] as? String == "guest",
            let appId = record["appId"] as? String, accepted.contains(appId) else { continue }
      record["scope"] = scope
      records[id] = record
    }
    try persist()
  }

  func retireOtherScopes(_ scope: String, now: Double) throws {
    lock.lock(); defer { lock.unlock() }
    for id in Array(records.keys) {
      guard var record = records[id], let owner = record["scope"] as? String,
            owner != scope, record["acknowledged"] as? Bool != true else { continue }
      record["action"] = record["action"] ?? "end"
      record["endedAt"] = record["endedAt"] ?? now
      records[id] = record
    }
    try persist()
  }

  func pendingIds() -> [String] {
    lock.lock(); defer { lock.unlock() }
    return records.keys.filter { records[$0]?["acknowledged"] as? Bool != true }
  }

  func attempt(appId: String, scope: String) -> String? {
    lock.lock(); defer { lock.unlock() }
    return records.first { $0.value["appId"] as? String == appId && $0.value["scope"] as? String == scope && $0.value["acknowledged"] as? Bool != true }?.key
  }

  func knowsApp(_ appId: String) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return records.values.contains { $0["appId"] as? String == appId }
  }

  var isReadable: Bool {
    lock.lock(); defer { lock.unlock() }
    return storageHealthy
  }

  func closurePayloads() -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    return records.compactMap { id, record in
      guard let action = record["action"] as? String, record["acknowledged"] as? Bool != true else { return nil }
      return ["type": action, "sessionId": id, "endedAt": record["endedAt"] ?? 0]
    }
  }
}
