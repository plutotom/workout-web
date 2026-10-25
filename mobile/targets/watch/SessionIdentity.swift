import Foundation

enum WatchSessionIdentity {
  static func shouldStart(_ requestedId: String, recording: Bool, closedIds: [String]) -> Bool {
    !requestedId.isEmpty && !recording && !closedIds.contains(requestedId)
  }

  static func matchesCommand(_ requestedId: String?, currentId: String) -> Bool {
    // Installed older phone binaries send unscoped commands.
    guard let requestedId else { return true }
    return !requestedId.isEmpty && requestedId == currentId
  }
}
