import Foundation

public struct RememberedSet: Codable, Sendable, Equatable, Hashable {
    public var workoutId: String
    public var workoutExerciseId: String
    public var setId: String
    public var position: Int
    public var weight: Weight
    public var reps: Int
    public var completedAt: Int64

    public init(
        workoutId: String,
        workoutExerciseId: String,
        setId: String,
        position: Int,
        weight: Weight,
        reps: Int,
        completedAt: Int64
    ) {
        self.workoutId = workoutId
        self.workoutExerciseId = workoutExerciseId
        self.setId = setId
        self.position = position
        self.weight = weight
        self.reps = reps
        self.completedAt = completedAt
    }
}

/// Pure remembered-weight selection from workout history.
/// Remembered weights are always computed from completed history — never stored separately.
public enum RememberedWeightSelector {
    /// Selects the single latest completed set for `(exerciseId, placeId, machineId)`.
    ///
    /// - Parameters:
    ///   - history: Workout aggregates to scan (in any order).
    ///   - exerciseId: Exercise identifier to match.
    ///   - placeId: Place (gym) identifier to match (`nil` matches untagged workouts).
    ///   - machineId: Machine identifier to match (`nil` matches exercises without a specific machine).
    ///   - defaultPlaceId: Optional default place ID; when provided and `placeId == defaultPlaceId`,
    ///     legacy workouts with `placeId == nil` also match the default gym.
    public static func latestCompletedSet(
        in history: [WorkoutAggregate],
        exerciseId: String,
        placeId: String?,
        machineId: String?,
        defaultPlaceId: String? = nil
    ) -> RememberedSet? {
        var best: (workoutTimestamp: Int64, set: RememberedSet)?

        for aggregate in history {
            let workout = aggregate.workout
            guard workout.deletedAt == nil, workout.status == .completed else { continue }
            guard matchesPlace(workoutPlaceId: workout.placeId, targetPlaceId: placeId, defaultPlaceId: defaultPlaceId) else {
                continue
            }

            let workoutTs = workout.endedAt ?? workout.startedAt

            for exerciseAgg in aggregate.exercises {
                let exercise = exerciseAgg.exercise
                guard exercise.deletedAt == nil,
                      exercise.exerciseId == exerciseId,
                      exercise.machineId == machineId
                else { continue }

                for set in exerciseAgg.sets {
                    guard set.deletedAt == nil, let completedAt = set.completedAt else { continue }
                    let candidate = RememberedSet(
                        workoutId: workout.id,
                        workoutExerciseId: exercise.id,
                        setId: set.id,
                        position: set.position,
                        weight: set.weight,
                        reps: set.reps,
                        completedAt: completedAt
                    )

                    if let current = best {
                        if isNewer(candidate: (workoutTs, candidate), than: current) {
                            best = (workoutTs, candidate)
                        }
                    } else {
                        best = (workoutTs, candidate)
                    }
                }
            }
        }

        return best?.set
    }

    /// Selects all completed sets (ordered by set position) from the most recent completed
    /// workout exercise matching `(exerciseId, placeId, machineId)`.
    public static func latestCompletedSessionSets(
        in history: [WorkoutAggregate],
        exerciseId: String,
        placeId: String?,
        machineId: String?,
        defaultPlaceId: String? = nil
    ) -> [RememberedSet] {
        var bestWorkoutTs: Int64 = .min
        var bestExerciseMaxCompletedAt: Int64 = .min
        var bestSets: [RememberedSet] = []

        for aggregate in history {
            let workout = aggregate.workout
            guard workout.deletedAt == nil, workout.status == .completed else { continue }
            guard matchesPlace(workoutPlaceId: workout.placeId, targetPlaceId: placeId, defaultPlaceId: defaultPlaceId) else {
                continue
            }

            let workoutTs = workout.endedAt ?? workout.startedAt

            for exerciseAgg in aggregate.exercises {
                let exercise = exerciseAgg.exercise
                guard exercise.deletedAt == nil,
                      exercise.exerciseId == exerciseId,
                      exercise.machineId == machineId
                else { continue }

                let completedSets: [RememberedSet] = exerciseAgg.sets
                    .compactMap { set in
                        guard set.deletedAt == nil, let completedAt = set.completedAt else { return nil }
                        return RememberedSet(
                            workoutId: workout.id,
                            workoutExerciseId: exercise.id,
                            setId: set.id,
                            position: set.position,
                            weight: set.weight,
                            reps: set.reps,
                            completedAt: completedAt
                        )
                    }
                    .sorted { $0.position < $1.position }

                guard let maxCompletedAt = completedSets.map(\.completedAt).max() else { continue }

                if workoutTs > bestWorkoutTs || (workoutTs == bestWorkoutTs && maxCompletedAt > bestExerciseMaxCompletedAt) {
                    bestWorkoutTs = workoutTs
                    bestExerciseMaxCompletedAt = maxCompletedAt
                    bestSets = completedSets
                }
            }
        }

        return bestSets
    }

    private static func matchesPlace(
        workoutPlaceId: String?,
        targetPlaceId: String?,
        defaultPlaceId: String?
    ) -> Bool {
        if workoutPlaceId == targetPlaceId {
            return true
        }
        if workoutPlaceId == nil, let targetPlaceId, let defaultPlaceId, targetPlaceId == defaultPlaceId {
            return true
        }
        return false
    }

    private static func isNewer(
        candidate: (workoutTimestamp: Int64, set: RememberedSet),
        than current: (workoutTimestamp: Int64, set: RememberedSet)
    ) -> Bool {
        if candidate.workoutTimestamp != current.workoutTimestamp {
            return candidate.workoutTimestamp > current.workoutTimestamp
        }
        if candidate.set.completedAt != current.set.completedAt {
            return candidate.set.completedAt > current.set.completedAt
        }
        return candidate.set.position > current.set.position
    }
}
