import Foundation
import GRDB

/// Owns the GRDB database connection and runs explicit append-only migrations at open time.
/// Always opens locally without network or auth dependencies.
public final class DatabaseManager: Sendable {
    public let writer: any DatabaseWriter

    public var reader: any DatabaseReader { writer }

    private init(writer: any DatabaseWriter) throws {
        self.writer = writer
        try Migrations.migrator.migrate(writer)
    }

    /// Opens an on-disk SQLite database using WAL mode (`DatabasePool`).
    public static func open(atPath path: String) throws -> DatabaseManager {
        var config = Configuration()
        config.foreignKeysEnabled = true
        let pool = try DatabasePool(path: path, configuration: config)
        return try DatabaseManager(writer: pool)
    }

    /// Opens an on-disk SQLite database using a single-connection `DatabaseQueue` (useful for
    /// snapshot migration tests and backup verification).
    public static func openQueue(atPath path: String) throws -> DatabaseManager {
        var config = Configuration()
        config.foreignKeysEnabled = true
        let queue = try DatabaseQueue(path: path, configuration: config)
        return try DatabaseManager(writer: queue)
    }

    /// Opens an ephemeral in-memory database for unit tests.
    public static func inMemory() throws -> DatabaseManager {
        var config = Configuration()
        config.foreignKeysEnabled = true
        let queue = try DatabaseQueue(configuration: config)
        return try DatabaseManager(writer: queue)
    }

    /// Default on-disk database location in Application Support.
    public static func defaultDatabaseURL(fileManager: FileManager = .default) throws -> URL {
        let baseDir = try fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let appDir = baseDir.appendingPathComponent("GrayedLift", isDirectory: true)
        try fileManager.createDirectory(at: appDir, withIntermediateDirectories: true)
        return appDir.appendingPathComponent("grayed.sqlite")
    }
}
