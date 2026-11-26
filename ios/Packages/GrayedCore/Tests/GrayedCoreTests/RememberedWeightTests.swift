import Foundation
import Testing
@testable import GrayedCore

@Suite("RememberedWeightSelector")
struct RememberedWeightTests {
    private func makeWorkout(
        id: String,
        status: WorkoutStatus = .completed,
        startedAt: Int64,
        endedAt: Int64?,
        placeId: String?,
        deletedAt: Int64? = nil,
        exercises: [(id: String, exerciseId: String, machineId: String?, deletedAt: Int64?, sets: [(id: String, pos: Int, weight: Int64, reps: Int, completedAt: Int64?, deletedAt: Int64?)])]
    ) -> WorkoutAggregate {
        let workout = Workout(
            id: id,
            ownerId: "user-1",
            status: status,
            startedAt: startedAt,
            endedAt: endedAt,
            placeId: placeId,
            createdAt: startedAt,
            updatedAt: endedAt ?? startedAt,
            deletedAt: deletedAt
        )
        let exAggs = exercises.enumerated().map { idx, ex in
            WorkoutExerciseAggregate(
                exercise: WorkoutExercise(
                    id: ex.id,
                    ownerId: "user-1",
                    workoutId: id,
                    position: idx,
                    exerciseId: ex.exerciseId,
                    machineId: ex.machineId,
                    createdAt: startedAt,
                    updatedAt: startedAt,
                    deletedAt: ex.deletedAt
                ),
                sets: ex.sets.map { s in
                    WorkoutSet(
                        id: s.id,
                        ownerId: "user-1",
                        workoutExerciseId: ex.id,
                        position: s.pos,
                        weight: Weight(hundredths: s.weight, unit: .lb),
                        reps: s.reps,
                        completedAt: s.completedAt,
                        createdAt: startedAt,
                        updatedAt: s.completedAt ?? startedAt,
                        deletedAt: s.deletedAt
                    )
                }
            )
        }
        return WorkoutAggregate(workout: workout, exercises: exAggs)
    }

    @Test("selects latest completed set for matching exercise + place + machine")
    func selectsLatestMatchingSet() {
        let older = makeWorkout(
            id: "w-1",
            startedAt: 1_000,
            endedAt: 2_000,
            placeId: "gym-a",
            exercises: [
                ("we-1", "builtin:bench", "mach-1", nil, [
                    ("s-1", 0, 18500, 8, 1_500, nil),
                    ("s-2", 1, 19500, 6, 1_800, nil),
                ]),
            ]
        )
        let newer = makeWorkout(
            id: "w-2",
            startedAt: 5_000,
            endedAt: 6_000,
            placeId: "gym-a",
            exercises: [
                ("we-2", "builtin:bench", "mach-1", nil, [
                    ("s-3", 0, 20500, 5, 5_500, nil),
                    ("s-4", 1, 21500, 5, nil, nil), // incomplete — must be ignored
                ]),
            ]
        )
        let otherMachine = makeWorkout(
            id: "w-3",
            startedAt: 9_000,
            endedAt: 10_000,
            placeId: "gym-a",
            exercises: [
                ("we-3", "builtin:bench", "mach-2", nil, [
                    ("s-5", 0, 25000, 5, 9_500, nil),
                ]),
            ]
        )
        let otherGym = makeWorkout(
            id: "w-4",
            startedAt: 11_000,
            endedAt: 12_000,
            placeId: "gym-b",
            exercises: [
                ("we-4", "builtin:bench", "mach-1", nil, [
                    ("s-6", 0, 27500, 3, 11_500, nil),
                ]),
            ]
        )

        let history = [older, otherGym, newer, otherMachine]
        let selected = RememberedWeightSelector.latestCompletedSet(
            in: history,
            exerciseId: "builtin:bench",
            placeId: "gym-a",
            machineId: "mach-1"
        )
        #expect(selected?.setId == "s-3")
        #expect(selected?.weight == Weight(hundredths: 20500, unit: .lb))
        #expect(selected?.reps == 5)
    }

    @Test("ignores active workouts and soft-deleted workouts/exercises/sets")
    func ignoresActiveAndDeleted() {
        let active = makeWorkout(
            id: "w-active",
            status: .active,
            startedAt: 9_000,
            endedAt: nil,
            placeId: "gym-a",
            exercises: [
                ("we-a", "builtin:squat", nil, nil, [
                    ("s-a", 0, 31500, 5, 9_100, nil),
                ]),
            ]
        )
        let deletedWorkout = makeWorkout(
            id: "w-deleted",
            startedAt: 8_000,
            endedAt: 8_500,
            placeId: "gym-a",
            deletedAt: 8_600,
            exercises: [
                ("we-d", "builtin:squat", nil, nil, [
                    ("s-d", 0, 30500, 5, 8_100, nil),
                ]),
            ]
        )
        let deletedSet = makeWorkout(
            id: "w-valid",
            startedAt: 4_000,
            endedAt: 4_500,
            placeId: "gym-a",
            exercises: [
                ("we-v", "builtin:squat", nil, nil, [
                    ("s-v1", 0, 22500, 5, 4_100, nil),
                    ("s-v2", 1, 27500, 5, 4_200, 4_300), // deleted set
                ]),
            ]
        )

        let selected = RememberedWeightSelector.latestCompletedSet(
            in: [active, deletedWorkout, deletedSet],
            exerciseId: "builtin:squat",
            placeId: "gym-a",
            machineId: nil
        )
        #expect(selected?.setId == "s-v1")
        #expect(selected?.weight == Weight(hundredths: 22500, unit: .lb))
    }

    @Test("matches untagged legacy workouts for default place only")
    func defaultPlaceFallback() {
        let untagged = makeWorkout(
            id: "w-legacy",
            startedAt: 1_000,
            endedAt: 2_000,
            placeId: nil,
            exercises: [
                ("we-1", "builtin:deadlift", nil, nil, [
                    ("s-1", 0, 31500, 5, 1_500, nil),
                ]),
            ]
        )

        let forDefault = RememberedWeightSelector.latestCompletedSet(
            in: [untagged],
            exerciseId: "builtin:deadlift",
            placeId: "home-gym",
            machineId: nil,
            defaultPlaceId: "home-gym"
        )
        #expect(forDefault?.setId == "s-1")

        let forOtherGym = RememberedWeightSelector.latestCompletedSet(
            in: [untagged],
            exerciseId: "builtin:deadlift",
            placeId: "travel-gym",
            machineId: nil,
            defaultPlaceId: "home-gym"
        )
        #expect(forOtherGym == nil)
    }

    @Test("returns full ordered completed set list from most recent matching session")
    func latestCompletedSessionSets() {
        let older = makeWorkout(
            id: "w-1",
            startedAt: 1_000,
            endedAt: 2_000,
            placeId: "gym-a",
            exercises: [
                ("we-1", "builtin:bench", nil, nil, [
                    ("s-1", 0, 13500, 10, 1_200, nil),
                ]),
            ]
        )
        let newer = makeWorkout(
            id: "w-2",
            startedAt: 5_000,
            endedAt: 6_000,
            placeId: "gym-a",
            exercises: [
                ("we-2", "builtin:bench", nil, nil, [
                    ("s-3", 1, 18500, 8, 5_600, nil),
                    ("s-2", 0, 18500, 10, 5_200, nil),
                    ("s-4", 2, 18500, 6, nil, nil),
                ]),
            ]
        )

        let sets = RememberedWeightSelector.latestCompletedSessionSets(
            in: [older, newer],
            exerciseId: "builtin:bench",
            placeId: "gym-a",
            machineId: nil
        )
        #expect(sets.map(\.setId) == ["s-2", "s-3"])
    }
}
