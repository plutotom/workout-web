import Foundation
import Testing
@testable import GrayedCore

@Suite("Models Codable round-trip")
struct ModelsCodableTests {
    @Test("WorkoutAggregate round-trips through JSON")
    func workoutAggregateCodable() throws {
        let aggregate = WorkoutAggregate(
            workout: Workout(
                id: "w-1",
                ownerId: "user-1",
                status: .completed,
                startedAt: 1_700_000_000_000,
                endedAt: 1_700_003_600_000,
                placeId: "p-1",
                templateId: "t-1",
                createdAt: 1_700_000_000_000,
                updatedAt: 1_700_003_600_000
            ),
            exercises: [
                WorkoutExerciseAggregate(
                    exercise: WorkoutExercise(
                        id: "we-1",
                        ownerId: "user-1",
                        workoutId: "w-1",
                        position: 0,
                        exerciseId: "builtin:bench",
                        machineId: "m-1",
                        createdAt: 1_700_000_000_000,
                        updatedAt: 1_700_000_000_000
                    ),
                    sets: [
                        WorkoutSet(
                            id: "ws-1",
                            ownerId: "user-1",
                            workoutExerciseId: "we-1",
                            position: 0,
                            weight: Weight(hundredths: 22500, unit: .lb),
                            reps: 5,
                            completedAt: 1_700_000_500_000,
                            createdAt: 1_700_000_000_000,
                            updatedAt: 1_700_000_500_000
                        ),
                    ]
                ),
            ]
        )

        let data = try JSONEncoder().encode(aggregate)
        let decoded = try JSONDecoder().decode(WorkoutAggregate.self, from: data)
        #expect(decoded == aggregate)
    }

    @Test("built-in exercise detection")
    func builtInDetection() {
        let builtin = Exercise(
            id: "builtin:bench",
            ownerId: "system",
            source: .builtin,
            name: "Bench Press",
            muscleGroups: ["chest"],
            usesBar: true,
            loadType: .weighted,
            createdAt: 0,
            updatedAt: 0
        )
        let custom = Exercise(
            id: "custom-uuid",
            ownerId: "user-1",
            source: .custom,
            name: "Belt Squat",
            muscleGroups: ["legs"],
            usesBar: false,
            loadType: .weighted,
            createdAt: 100,
            updatedAt: 100
        )
        #expect(builtin.isBuiltIn == true)
        #expect(custom.isBuiltIn == false)
    }
}
