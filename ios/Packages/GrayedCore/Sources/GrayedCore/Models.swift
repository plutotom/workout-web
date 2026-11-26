import Foundation

public enum ExerciseSource: String, Codable, Sendable, Hashable {
    case builtin
    case custom
}

public enum LoadType: String, Codable, Sendable, Hashable {
    case weighted
    case assisted
    case bodyweight
}

public enum WorkoutStatus: String, Codable, Sendable, Hashable {
    case active
    case completed
}

public enum PreferredView: String, Codable, Sendable, Hashable {
    case list
    case focus
}

public struct Exercise: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var ownerId: String
    public var source: ExerciseSource
    public var name: String
    public var muscleGroups: [String]
    public var equipment: String?
    public var usesBar: Bool
    public var loadType: LoadType
    public var archivedAt: Int64?
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        id: String,
        ownerId: String,
        source: ExerciseSource,
        name: String,
        muscleGroups: [String],
        equipment: String? = nil,
        usesBar: Bool = false,
        loadType: LoadType = .weighted,
        archivedAt: Int64? = nil,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.source = source
        self.name = name
        self.muscleGroups = muscleGroups
        self.equipment = equipment
        self.usesBar = usesBar
        self.loadType = loadType
        self.archivedAt = archivedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }

    public var isBuiltIn: Bool {
        source == .builtin || id.hasPrefix("builtin:")
    }
}

public struct Place: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var ownerId: String
    public var name: String
    public var isDefault: Bool
    public var archivedAt: Int64?
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        id: String,
        ownerId: String,
        name: String,
        isDefault: Bool = false,
        archivedAt: Int64? = nil,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.name = name
        self.isDefault = isDefault
        self.archivedAt = archivedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
}

public struct Machine: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var ownerId: String
    public var placeId: String
    public var name: String
    public var archivedAt: Int64?
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        id: String,
        ownerId: String,
        placeId: String,
        name: String,
        archivedAt: Int64? = nil,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.placeId = placeId
        self.name = name
        self.archivedAt = archivedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
}

public struct Template: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var ownerId: String
    public var name: String
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        id: String,
        ownerId: String,
        name: String,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.name = name
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
}

public struct TemplateExercise: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var ownerId: String
    public var templateId: String
    public var position: Int
    public var exerciseId: String
    public var setCount: Int
    public var targetReps: Int?
    public var presetWeight: Weight?
    public var stickyNote: String?
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        id: String,
        ownerId: String,
        templateId: String,
        position: Int,
        exerciseId: String,
        setCount: Int,
        targetReps: Int? = nil,
        presetWeight: Weight? = nil,
        stickyNote: String? = nil,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.templateId = templateId
        self.position = position
        self.exerciseId = exerciseId
        self.setCount = setCount
        self.targetReps = targetReps
        self.presetWeight = presetWeight
        self.stickyNote = stickyNote
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
}

public struct Workout: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var ownerId: String
    public var status: WorkoutStatus
    public var startedAt: Int64
    public var endedAt: Int64?
    public var placeId: String?
    public var templateId: String?
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        id: String,
        ownerId: String,
        status: WorkoutStatus,
        startedAt: Int64,
        endedAt: Int64? = nil,
        placeId: String? = nil,
        templateId: String? = nil,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.status = status
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.placeId = placeId
        self.templateId = templateId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
}

public struct WorkoutExercise: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var ownerId: String
    public var workoutId: String
    public var position: Int
    public var exerciseId: String
    public var machineId: String?
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        id: String,
        ownerId: String,
        workoutId: String,
        position: Int,
        exerciseId: String,
        machineId: String? = nil,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.workoutId = workoutId
        self.position = position
        self.exerciseId = exerciseId
        self.machineId = machineId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
}

public struct WorkoutSet: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var ownerId: String
    public var workoutExerciseId: String
    public var position: Int
    public var weight: Weight
    public var reps: Int
    public var completedAt: Int64?
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        id: String,
        ownerId: String,
        workoutExerciseId: String,
        position: Int,
        weight: Weight,
        reps: Int,
        completedAt: Int64? = nil,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.id = id
        self.ownerId = ownerId
        self.workoutExerciseId = workoutExerciseId
        self.position = position
        self.weight = weight
        self.reps = reps
        self.completedAt = completedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }

    public var isCompleted: Bool {
        completedAt != nil
    }
}

public struct UserSettings: Codable, Sendable, Equatable, Hashable {
    public var ownerId: String
    public var defaultUnit: WeightUnit
    public var barWeight: Weight
    public var weeklyGoal: Int
    public var preferredView: PreferredView
    public var createdAt: Int64
    public var updatedAt: Int64
    public var deletedAt: Int64?

    public init(
        ownerId: String,
        defaultUnit: WeightUnit = .lb,
        barWeight: Weight = Weight(hundredths: 4500, unit: .lb),
        weeklyGoal: Int = 3,
        preferredView: PreferredView = .list,
        createdAt: Int64,
        updatedAt: Int64,
        deletedAt: Int64? = nil
    ) {
        self.ownerId = ownerId
        self.defaultUnit = defaultUnit
        self.barWeight = barWeight
        self.weeklyGoal = weeklyGoal
        self.preferredView = preferredView
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
}

// MARK: - Sync Aggregates

public struct WorkoutExerciseAggregate: Codable, Sendable, Equatable, Hashable {
    public var exercise: WorkoutExercise
    public var sets: [WorkoutSet]

    public init(exercise: WorkoutExercise, sets: [WorkoutSet]) {
        self.exercise = exercise
        self.sets = sets
    }
}

public struct WorkoutAggregate: Codable, Sendable, Equatable, Hashable {
    public var workout: Workout
    public var exercises: [WorkoutExerciseAggregate]

    public init(workout: Workout, exercises: [WorkoutExerciseAggregate]) {
        self.workout = workout
        self.exercises = exercises
    }
}

public struct TemplateAggregate: Codable, Sendable, Equatable, Hashable {
    public var template: Template
    public var exercises: [TemplateExercise]

    public init(template: Template, exercises: [TemplateExercise]) {
        self.template = template
        self.exercises = exercises
    }
}
