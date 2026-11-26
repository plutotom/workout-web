import Foundation
import GrayedCore
@testable import GrayedStore

enum SampleData {
    static let ownerId = "account-alpha"
    static let otherOwnerId = "account-beta"

    static let builtInBench = Exercise(
        id: "builtin:bench-press",
        ownerId: "system",
        source: .builtin,
        name: "Barbell Bench Press",
        muscleGroups: ["chest", "arms"],
        equipment: "barbell",
        usesBar: true,
        loadType: .weighted,
        archivedAt: nil,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000
    )

    static let customBeltSquat = Exercise(
        id: "ex-custom-1",
        ownerId: ownerId,
        source: .custom,
        name: "Belt Squat",
        muscleGroups: ["legs"],
        equipment: "machine",
        usesBar: false,
        loadType: .weighted,
        archivedAt: nil,
        createdAt: 1_700_000_001_000,
        updatedAt: 1_700_000_001_000
    )

    static let homeGym = Place(
        id: "place-home",
        ownerId: ownerId,
        name: "Home Gym",
        isDefault: true,
        archivedAt: nil,
        createdAt: 1_700_000_002_000,
        updatedAt: 1_700_000_002_000
    )

    static let cornerRack = Machine(
        id: "machine-rack-1",
        ownerId: ownerId,
        placeId: "place-home",
        name: "Corner Power Rack",
        archivedAt: nil,
        createdAt: 1_700_000_003_000,
        updatedAt: 1_700_000_003_000
    )

    static let pushTemplate = TemplateAggregate(
        template: Template(
            id: "tpl-push-1",
            ownerId: ownerId,
            name: "Upper Push",
            createdAt: 1_700_000_010_000,
            updatedAt: 1_700_000_010_000
        ),
        exercises: [
            TemplateExercise(
                id: "tplex-1",
                ownerId: ownerId,
                templateId: "tpl-push-1",
                position: 0,
                exerciseId: "builtin:bench-press",
                setCount: 3,
                targetReps: 5,
                presetWeight: Weight(hundredths: 22500, unit: .lb),
                stickyNote: "Pinch shoulder blades, pause 1s on chest",
                createdAt: 1_700_000_010_000,
                updatedAt: 1_700_000_010_000
            ),
        ]
    )

    static let completedWorkout = WorkoutAggregate(
        workout: Workout(
            id: "wk-completed-1",
            ownerId: ownerId,
            status: .completed,
            startedAt: 1_700_001_000_000,
            endedAt: 1_700_004_600_000,
            placeId: "place-home",
            templateId: "tpl-push-1",
            createdAt: 1_700_001_000_000,
            updatedAt: 1_700_004_600_000
        ),
        exercises: [
            WorkoutExerciseAggregate(
                exercise: WorkoutExercise(
                    id: "wkex-1",
                    ownerId: ownerId,
                    workoutId: "wk-completed-1",
                    position: 0,
                    exerciseId: "builtin:bench-press",
                    machineId: "machine-rack-1",
                    createdAt: 1_700_001_000_000,
                    updatedAt: 1_700_001_000_000
                ),
                sets: [
                    WorkoutSet(
                        id: "wkset-1",
                        ownerId: ownerId,
                        workoutExerciseId: "wkex-1",
                        position: 0,
                        weight: Weight(hundredths: 22500, unit: .lb),
                        reps: 5,
                        completedAt: 1_700_001_300_000,
                        createdAt: 1_700_001_000_000,
                        updatedAt: 1_700_001_300_000
                    ),
                    WorkoutSet(
                        id: "wkset-2",
                        ownerId: ownerId,
                        workoutExerciseId: "wkex-1",
                        position: 1,
                        weight: Weight(hundredths: 22750, unit: .lb),
                        reps: 5,
                        completedAt: 1_700_001_600_000,
                        createdAt: 1_700_001_000_000,
                        updatedAt: 1_700_001_600_000
                    ),
                ]
            ),
        ]
    )

    static let settings = UserSettings(
        ownerId: ownerId,
        defaultUnit: .lb,
        barWeight: Weight(hundredths: 4500, unit: .lb),
        weeklyGoal: 4,
        preferredView: .list,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000
    )

    static func populateRepresentativeV1Data(in store: GrayedStore) throws {
        try store.saveExercise(builtInBench, accountId: ownerId)
        try store.saveExercise(customBeltSquat, accountId: ownerId, opId: "op-ex-1", createdAt: 1_700_000_001_000)
        try store.savePlace(homeGym, accountId: ownerId, opId: "op-place-1", createdAt: 1_700_000_002_000)
        try store.saveMachine(cornerRack, accountId: ownerId, opId: "op-machine-1", createdAt: 1_700_000_003_000)
        try store.saveTemplateAggregate(pushTemplate, accountId: ownerId, opId: "op-tpl-1", createdAt: 1_700_000_010_000)
        try store.saveWorkoutAggregate(completedWorkout, accountId: ownerId, opId: "op-wk-1", createdAt: 1_700_004_600_000)
        try store.saveSettings(settings, accountId: ownerId, opId: "op-settings-1", createdAt: 1_700_000_000_000)

        try store.database.writer.write { db in
            let syncState = SyncStateRecord(accountId: ownerId, pullCursor: 42, lastPullAt: 1_700_005_000_000)
            try syncState.save(db)
        }
    }
}
