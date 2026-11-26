# Migration Snapshot Fixtures

Every shipped GRDB schema version keeps a frozen SQLite snapshot in this directory (`v1.sqlite`, `v2.sqlite`, ...).
`MigrationSnapshotTests` copies every `*.sqlite` file found here into a temporary directory, runs `Migrations.migrator` up to the current schema, runs SQLite integrity + foreign-key checks, and asserts that all representative data survives.

## Adding a new migration (`v<N>_<name>`)

1. **Never edit a shipped migration** in `Sources/GrayedStore/Migrations.swift` or modify an existing `v*.sqlite` file.
2. Append your new migration `migrator.registerMigration("v<N>_<short_name>") { db in ... }` to `Migrations.swift`.
3. Generate a new snapshot at schema version `N` containing representative rows for every table/column introduced in `v<N>`:
   - Open a fresh `DatabaseQueue(path: "/path/to/v<N>.sqlite")`.
   - Run `try Migrations.migrator.migrate(db)` and populate representative records via `GrayedStore` (or direct SQL if populating legacy columns).
   - Ensure WAL files (`-wal`, `-shm`) are checkpointed / absent by using `DatabaseQueue` (journal mode DELETE).
4. Commit `Fixtures/v<N>.sqlite` in the same commit as the migration.
5. Update `MigrationSnapshotTests` with assertions verifying the new columns/tables survive future upgrades, and run `swift test`.
