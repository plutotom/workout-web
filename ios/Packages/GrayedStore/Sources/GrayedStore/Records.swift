import Foundation
import GRDB
import GrayedCore

// MARK: - Domain Records

struct ExerciseRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "exercise"

    var id: String
    var ownerId: String
    var source: String
    var name: String
    var muscleGroups: String
    var equipment: String?
    var usesBar: Bool
    var loadType: String
    var archivedAt: Int64?
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?
    var serverVersion: Int

    init(from model: Exercise, serverVersion: Int = 0) throws {
        let groupsData = try JSONEncoder().encode(model.muscleGroups)
        let groupsJSON = String(decoding: groupsData, as: UTF8.self)
        self.id = model.id
        self.ownerId = model.ownerId
        self.source = model.source.rawValue
        self.name = model.name
        self.muscleGroups = groupsJSON
        self.equipment = model.equipment
        self.usesBar = model.usesBar
        self.loadType = model.loadType.rawValue
        self.archivedAt = model.archivedAt
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
        self.serverVersion = serverVersion
    }

    func toModel() throws -> Exercise {
        let groups = try JSONDecoder().decode([String].self, from: Data(muscleGroups.utf8))
        return Exercise(
            id: id,
            ownerId: ownerId,
            source: ExerciseSource(rawValue: source) ?? .custom,
            name: name,
            muscleGroups: groups,
            equipment: equipment,
            usesBar: usesBar,
            loadType: LoadType(rawValue: loadType) ?? .weighted,
            archivedAt: archivedAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}

struct PlaceRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "place"

    var id: String
    var ownerId: String
    var name: String
    var isDefault: Bool
    var archivedAt: Int64?
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?
    var serverVersion: Int

    init(from model: Place, serverVersion: Int = 0) {
        self.id = model.id
        self.ownerId = model.ownerId
        self.name = model.name
        self.isDefault = model.isDefault
        self.archivedAt = model.archivedAt
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
        self.serverVersion = serverVersion
    }

    func toModel() -> Place {
        Place(
            id: id,
            ownerId: ownerId,
            name: name,
            isDefault: isDefault,
            archivedAt: archivedAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}

struct MachineRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "machine"

    var id: String
    var ownerId: String
    var placeId: String
    var name: String
    var archivedAt: Int64?
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?
    var serverVersion: Int

    init(from model: Machine, serverVersion: Int = 0) {
        self.id = model.id
        self.ownerId = model.ownerId
        self.placeId = model.placeId
        self.name = model.name
        self.archivedAt = model.archivedAt
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
        self.serverVersion = serverVersion
    }

    func toModel() -> Machine {
        Machine(
            id: id,
            ownerId: ownerId,
            placeId: placeId,
            name: name,
            archivedAt: archivedAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}

struct TemplateRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "template"

    var id: String
    var ownerId: String
    var name: String
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?
    var serverVersion: Int

    init(from model: Template, serverVersion: Int = 0) {
        self.id = model.id
        self.ownerId = model.ownerId
        self.name = model.name
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
        self.serverVersion = serverVersion
    }

    func toModel() -> Template {
        Template(
            id: id,
            ownerId: ownerId,
            name: name,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}

struct TemplateExerciseRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "template_exercise"

    var id: String
    var ownerId: String
    var templateId: String
    var position: Int
    var exerciseId: String
    var setCount: Int
    var targetReps: Int?
    var presetWeight: Int64?
    var presetUnit: String?
    var stickyNote: String?
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?

    init(from model: TemplateExercise) {
        self.id = model.id
        self.ownerId = model.ownerId
        self.templateId = model.templateId
        self.position = model.position
        self.exerciseId = model.exerciseId
        self.setCount = model.setCount
        self.targetReps = model.targetReps
        self.presetWeight = model.presetWeight?.hundredths
        self.presetUnit = model.presetWeight?.unit.rawValue
        self.stickyNote = model.stickyNote
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
    }

    func toModel() -> TemplateExercise {
        let preset: Weight?
        if let weight = presetWeight, let unitRaw = presetUnit, let unit = WeightUnit(rawValue: unitRaw) {
            preset = Weight(hundredths: weight, unit: unit)
        } else {
            preset = nil
        }
        return TemplateExercise(
            id: id,
            ownerId: ownerId,
            templateId: templateId,
            position: position,
            exerciseId: exerciseId,
            setCount: setCount,
            targetReps: targetReps,
            presetWeight: preset,
            stickyNote: stickyNote,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}

struct WorkoutRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "workout"

    var id: String
    var ownerId: String
    var status: String
    var startedAt: Int64
    var endedAt: Int64?
    var placeId: String?
    var templateId: String?
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?
    var serverVersion: Int

    init(from model: Workout, serverVersion: Int = 0) {
        self.id = model.id
        self.ownerId = model.ownerId
        self.status = model.status.rawValue
        self.startedAt = model.startedAt
        self.endedAt = model.endedAt
        self.placeId = model.placeId
        self.templateId = model.templateId
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
        self.serverVersion = serverVersion
    }

    func toModel() -> Workout {
        Workout(
            id: id,
            ownerId: ownerId,
            status: WorkoutStatus(rawValue: status) ?? .completed,
            startedAt: startedAt,
            endedAt: endedAt,
            placeId: placeId,
            templateId: templateId,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}

struct WorkoutExerciseRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "workout_exercise"

    var id: String
    var ownerId: String
    var workoutId: String
    var position: Int
    var exerciseId: String
    var machineId: String?
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?

    init(from model: WorkoutExercise) {
        self.id = model.id
        self.ownerId = model.ownerId
        self.workoutId = model.workoutId
        self.position = model.position
        self.exerciseId = model.exerciseId
        self.machineId = model.machineId
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
    }

    func toModel() -> WorkoutExercise {
        WorkoutExercise(
            id: id,
            ownerId: ownerId,
            workoutId: workoutId,
            position: position,
            exerciseId: exerciseId,
            machineId: machineId,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}

struct WorkoutSetRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "workout_set"

    var id: String
    var ownerId: String
    var workoutExerciseId: String
    var position: Int
    var weight: Int64
    var unit: String
    var reps: Int
    var completedAt: Int64?
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?

    init(from model: WorkoutSet) {
        self.id = model.id
        self.ownerId = model.ownerId
        self.workoutExerciseId = model.workoutExerciseId
        self.position = model.position
        self.weight = model.weight.hundredths
        self.unit = model.weight.unit.rawValue
        self.reps = model.reps
        self.completedAt = model.completedAt
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
    }

    func toModel() -> WorkoutSet {
        WorkoutSet(
            id: id,
            ownerId: ownerId,
            workoutExerciseId: workoutExerciseId,
            position: position,
            weight: Weight(hundredths: weight, unit: WeightUnit(rawValue: unit) ?? .lb),
            reps: reps,
            completedAt: completedAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}

struct SettingsRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    static let databaseTableName = "settings"

    var ownerId: String
    var defaultUnit: String
    var barWeight: Int64
    var barUnit: String
    var weeklyGoal: Int
    var preferredView: String
    var createdAt: Int64
    var updatedAt: Int64
    var deletedAt: Int64?
    var serverVersion: Int

    init(from model: UserSettings, serverVersion: Int = 0) {
        self.ownerId = model.ownerId
        self.defaultUnit = model.defaultUnit.rawValue
        self.barWeight = model.barWeight.hundredths
        self.barUnit = model.barWeight.unit.rawValue
        self.weeklyGoal = model.weeklyGoal
        self.preferredView = model.preferredView.rawValue
        self.createdAt = model.createdAt
        self.updatedAt = model.updatedAt
        self.deletedAt = model.deletedAt
        self.serverVersion = serverVersion
    }

    func toModel() -> UserSettings {
        UserSettings(
            ownerId: ownerId,
            defaultUnit: WeightUnit(rawValue: defaultUnit) ?? .lb,
            barWeight: Weight(hundredths: barWeight, unit: WeightUnit(rawValue: barUnit) ?? .lb),
            weeklyGoal: weeklyGoal,
            preferredView: PreferredView(rawValue: preferredView) ?? .list,
            createdAt: createdAt,
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }
}
