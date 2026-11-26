import Foundation
import GRDB
import GrayedCore
import Testing
@testable import GrayedStore

private enum SimulatedFailure: Error {
    case crashMidTransaction
}

@Suite("Store transaction atomicity and schema invariants")
struct TransactionAtomicityTests {
    @Test("failure mid-workout write rolls back both workout aggregate and outbox entry")
    func workoutWriteAtomicity() throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)

        #expect(throws: SimulatedFailure.crashMidTransaction) {
            try store.saveWorkoutAggregate(
                SampleData.completedWorkout,
                accountId: SampleData.ownerId,
                opId: "op-atomic-1",
                beforeOutboxCommit: { _ in
                    throw SimulatedFailure.crashMidTransaction
                }
            )
        }

        #expect(try store.fetchWorkoutAggregate(id: SampleData.completedWorkout.workout.id) == nil)
        #expect(try store.fetchAllOutbox().isEmpty)

        // Also ensure no orphaned child rows survived.
        let (exCount, setCount) = try db.reader.read { db in
            let ex = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM workout_exercise") ?? -1
            let sets = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM workout_set") ?? -1
            return (ex, sets)
        }
        #expect(exCount == 0)
        #expect(setCount == 0)
    }

    @Test("duplicate opId fails outbox insert and rolls back the workout write")
    func duplicateOpIdRollsBackWorkout() throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)

        try store.saveWorkoutAggregate(
            SampleData.completedWorkout,
            accountId: SampleData.ownerId,
            opId: "op-shared-id"
        )

        var second = SampleData.completedWorkout
        second.workout.id = "wk-second"
        second.exercises = []

        #expect(throws: DatabaseError.self) {
            try store.saveWorkoutAggregate(
                second,
                accountId: SampleData.ownerId,
                opId: "op-shared-id"
            )
        }

        // Second workout must not exist because the outbox insert failed in the same transaction.
        #expect(try store.fetchWorkoutAggregate(id: "wk-second") == nil)
        #expect(try store.fetchAllOutbox().count == 1)
    }

    @Test("failure mid-template write rolls back both template aggregate and outbox entry")
    func templateWriteAtomicity() throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)

        #expect(throws: SimulatedFailure.crashMidTransaction) {
            try store.saveTemplateAggregate(
                SampleData.pushTemplate,
                accountId: SampleData.ownerId,
                opId: "op-tpl-atomic",
                beforeOutboxCommit: { _ in
                    throw SimulatedFailure.crashMidTransaction
                }
            )
        }

        #expect(try store.fetchTemplateAggregate(id: SampleData.pushTemplate.template.id) == nil)
        #expect(try store.fetchAllOutbox().isEmpty)
    }

    @Test("enforces partial unique index: at most one non-deleted active workout per owner")
    func oneActiveWorkoutPerOwner() throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)

        let active1 = WorkoutAggregate(
            workout: Workout(
                id: "wk-active-1",
                ownerId: SampleData.ownerId,
                status: .active,
                startedAt: 1_000,
                createdAt: 1_000,
                updatedAt: 1_000
            ),
            exercises: []
        )
        let active2 = WorkoutAggregate(
            workout: Workout(
                id: "wk-active-2",
                ownerId: SampleData.ownerId,
                status: .active,
                startedAt: 2_000,
                createdAt: 2_000,
                updatedAt: 2_000
            ),
            exercises: []
        )
        let activeOtherOwner = WorkoutAggregate(
            workout: Workout(
                id: "wk-active-beta",
                ownerId: SampleData.otherOwnerId,
                status: .active,
                startedAt: 2_000,
                createdAt: 2_000,
                updatedAt: 2_000
            ),
            exercises: []
        )

        try store.saveWorkoutAggregate(active1, accountId: SampleData.ownerId, opId: "op-a1")

        // Second active workout for same owner fails and leaves no outbox entry.
        #expect(throws: DatabaseError.self) {
            try store.saveWorkoutAggregate(active2, accountId: SampleData.ownerId, opId: "op-a2")
        }
        #expect(try store.fetchPendingOutbox(accountId: SampleData.ownerId).map(\.opId) == ["op-a1"])

        // Different owner can have their own active workout.
        try store.saveWorkoutAggregate(activeOtherOwner, accountId: SampleData.otherOwnerId, opId: "op-b1")
        #expect(try store.fetchActiveWorkout(ownerId: SampleData.otherOwnerId)?.workout.id == "wk-active-beta")

        // Completing the first active workout allows starting a new active one.
        var finished = active1
        finished.workout.status = .completed
        finished.workout.endedAt = 1_500
        finished.workout.updatedAt = 1_500
        try store.saveWorkoutAggregate(finished, accountId: SampleData.ownerId, opId: "op-a1-finish")
        try store.saveWorkoutAggregate(active2, accountId: SampleData.ownerId, opId: "op-a2-retry")
        #expect(try store.fetchActiveWorkout(ownerId: SampleData.ownerId)?.workout.id == "wk-active-2")
    }

    @Test("built-in exercises are stored locally and never enqueued into outbox")
    func builtInExerciseNeverEnqueuesOutbox() throws {
        let db = try DatabaseManager.inMemory()
        let store = GrayedStore(database: db)

        let builtInEntry = try store.saveExercise(SampleData.builtInBench, accountId: SampleData.ownerId)
        #expect(builtInEntry == nil)
        #expect(try store.fetchExercise(id: SampleData.builtInBench.id) == SampleData.builtInBench)
        #expect(try store.fetchAllOutbox().isEmpty)

        let customEntry = try store.saveExercise(SampleData.customBeltSquat, accountId: SampleData.ownerId, opId: "op-custom")
        #expect(customEntry?.opId == "op-custom")
        #expect(try store.fetchAllOutbox().count == 1)
    }
}
