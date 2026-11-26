import Foundation

public struct PlateConfig: Codable, Sendable, Equatable, Hashable {
    /// Empty bar weight in hundredths of the config's unit.
    public var barHundredths: Int64
    /// Plate denominations in hundredths, largest first.
    public var platesHundredths: [Int64]

    public init(barHundredths: Int64, platesHundredths: [Int64]) {
        self.barHundredths = barHundredths
        self.platesHundredths = platesHundredths
    }

    public init(bar: Double, plates: [Double]) {
        self.barHundredths = Int64((bar * 100.0).rounded())
        self.platesHundredths = plates.map { Int64(($0 * 100.0).rounded()) }
    }

    public var bar: Double {
        Double(barHundredths) / 100.0
    }

    public var plates: [Double] {
        platesHundredths.map { Double($0) / 100.0 }
    }
}

public enum StandardPlates {
    public static let lb = PlateConfig(
        barHundredths: 4500,
        platesHundredths: [4500, 3500, 2500, 1000, 500, 250]
    )

    public static let kg = PlateConfig(
        barHundredths: 2000,
        platesHundredths: [2500, 2000, 1500, 1000, 500, 250, 125]
    )

    public static func config(for unit: WeightUnit) -> PlateConfig {
        switch unit {
        case .lb: lb
        case .kg: kg
        }
    }

    public static func barPresetsHundredths(for unit: WeightUnit) -> [Int64] {
        switch unit {
        case .lb: [4500, 3500, 1500]
        case .kg: [2000, 1500, 1000]
        }
    }
}

/// A denomination loaded `count` times on each side of the bar.
public struct PlateCount: Codable, Sendable, Equatable, Hashable {
    public var plateHundredths: Int64
    public var count: Int

    public init(plateHundredths: Int64, count: Int) {
        self.plateHundredths = plateHundredths
        self.count = count
    }

    public init(plate: Double, count: Int) {
        self.plateHundredths = Int64((plate * 100.0).rounded())
        self.count = count
    }

    public var plate: Double {
        Double(plateHundredths) / 100.0
    }
}

public struct WeightToPlates: Codable, Sendable, Equatable, Hashable {
    /// False when the target is below the bar weight.
    public var feasible: Bool
    /// Plates to load on each side, largest first.
    public var perSide: [PlateCount]
    /// Actual total achieved in hundredths: bar + 2 * per-side sum.
    public var loadedTotalHundredths: Int64
    /// How far short of the target in hundredths (>= 0).
    public var remainderHundredths: Int64
    /// True when the target is loadable exactly.
    public var exact: Bool

    public var loadedTotal: Double { Double(loadedTotalHundredths) / 100.0 }
    public var remainder: Double { Double(remainderHundredths) / 100.0 }
}

public enum PlateCalculator {
    /// Greedily load the largest plates that fit on each side.
    /// Uses fixed-point hundredths to avoid floating-point drift.
    public static func solveWeightToPlates(
        targetHundredths: Int64,
        config: PlateConfig = StandardPlates.lb
    ) -> WeightToPlates {
        if targetHundredths < config.barHundredths {
            return WeightToPlates(
                feasible: false,
                perSide: [],
                loadedTotalHundredths: config.barHundredths,
                remainderHundredths: 0,
                exact: false
            )
        }

        // Work in doubled-hundredths so dividing (target - bar) by 2 stays exact in integers.
        var remainingTwoSides = targetHundredths - config.barHundredths
        var perSide: [PlateCount] = []
        for plate in config.platesHundredths where plate > 0 {
            let pairWeight = plate * 2
            let count = Int(remainingTwoSides / pairWeight)
            if count > 0 {
                perSide.append(PlateCount(plateHundredths: plate, count: count))
                remainingTwoSides -= Int64(count) * pairWeight
            }
        }

        let loadedTotal = platesToWeightHundredths(perSide: perSide, config: config)
        let remainder = targetHundredths - loadedTotal
        return WeightToPlates(
            feasible: true,
            perSide: perSide,
            loadedTotalHundredths: loadedTotal,
            remainderHundredths: remainder,
            exact: remainder == 0
        )
    }

    public static func solveWeightToPlates(
        target: Weight,
        config: PlateConfig? = nil
    ) -> WeightToPlates {
        solveWeightToPlates(
            targetHundredths: target.hundredths,
            config: config ?? StandardPlates.config(for: target.unit)
        )
    }

    public static func solveWeightToPlates(
        target: Double,
        config: PlateConfig = StandardPlates.lb
    ) -> WeightToPlates {
        solveWeightToPlates(
            targetHundredths: Int64((target * 100.0).rounded()),
            config: config
        )
    }

    /// Total bar weight in hundredths for a per-side plate selection: bar + 2 * per-side sum.
    public static func platesToWeightHundredths(
        perSide: [PlateCount],
        config: PlateConfig = StandardPlates.lb
    ) -> Int64 {
        let perSideSum = perSide.reduce(Int64(0)) { $0 + $1.plateHundredths * Int64($1.count) }
        return config.barHundredths + 2 * perSideSum
    }

    public static func platesToWeight(
        perSide: [PlateCount],
        unit: WeightUnit,
        config: PlateConfig? = nil
    ) -> Weight {
        let resolved = config ?? StandardPlates.config(for: unit)
        return Weight(
            hundredths: platesToWeightHundredths(perSide: perSide, config: resolved),
            unit: unit
        )
    }

    public static func platesToWeightDouble(
        perSide: [PlateCount],
        config: PlateConfig = StandardPlates.lb
    ) -> Double {
        Double(platesToWeightHundredths(perSide: perSide, config: config)) / 100.0
    }
}

// MARK: - Plate Session Composition (Pure Reducer)

public typealias PlateCounts = [Int64: Int]

public enum PlateCalculatorMode: String, Codable, Sendable, Equatable {
    case toPlates
    case toWeight
}

public struct StoredPlateComposition: Codable, Sendable, Equatable {
    public var counts: PlateCounts
    public var barHundredths: Int64
    public var countBar: Bool
    public var unit: WeightUnit

    public init(counts: PlateCounts, barHundredths: Int64, countBar: Bool, unit: WeightUnit) {
        self.counts = counts
        self.barHundredths = barHundredths
        self.countBar = countBar
        self.unit = unit
    }
}

public struct PlateSessionState: Sendable, Equatable {
    public var mode: PlateCalculatorMode
    public var draft: String
    public var countBar: Bool
    public var barHundredths: Int64
    public var barDraft: String
    public var counts: PlateCounts
    public var unit: WeightUnit

    public init(
        mode: PlateCalculatorMode,
        draft: String,
        countBar: Bool,
        barHundredths: Int64,
        barDraft: String,
        counts: PlateCounts,
        unit: WeightUnit
    ) {
        self.mode = mode
        self.draft = draft
        self.countBar = countBar
        self.barHundredths = barHundredths
        self.barDraft = barDraft
        self.counts = counts
        self.unit = unit
    }
}

public enum PlateSessionAction: Sendable, Equatable {
    case setMode(PlateCalculatorMode)
    case setTargetDraft(String)
    case changeCount(plateHundredths: Int64, delta: Int)
    case clearPlates
    case setCountBar(Bool)
    case selectBar(barHundredths: Int64)
    case setBarDraft(String)
}

public enum PlateComposition {
    public static func compositionId(exerciseId: String, setId: String) -> String {
        "\(exerciseId):\(setId)"
    }

    public static func sanitizeDecimal(_ value: String) -> String {
        let filtered = value.filter { $0.isNumber || $0 == "." }
        let parts = filtered.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count > 1 else { return filtered }
        return "\(parts[0]).\(parts.dropFirst().joined())"
    }

    public static func plateCounts(from perSide: [PlateCount]) -> PlateCounts {
        var counts: PlateCounts = [:]
        for entry in perSide where entry.count > 0 {
            counts[entry.plateHundredths] = entry.count
        }
        return counts
    }

    public static func perSide(from counts: PlateCounts, platesHundredths: [Int64]) -> [PlateCount] {
        platesHundredths.compactMap { plate in
            guard let count = counts[plate], count > 0 else { return nil }
            return PlateCount(plateHundredths: plate, count: count)
        }
    }

    public static func changePlateCount(
        _ counts: PlateCounts,
        plateHundredths: Int64,
        delta: Int
    ) -> PlateCounts {
        var next = counts
        let updated = max(0, (counts[plateHundredths] ?? 0) + delta)
        if updated == 0 {
            next.removeValue(forKey: plateHundredths)
        } else {
            next[plateHundredths] = updated
        }
        return next
    }

    public static func sessionConfig(
        barHundredths: Int64,
        countBar: Bool,
        platesHundredths: [Int64]
    ) -> PlateConfig {
        PlateConfig(
            barHundredths: countBar ? barHundredths : 0,
            platesHundredths: platesHundredths
        )
    }

    public static func sessionTotalHundredths(
        _ state: PlateSessionState,
        platesHundredths: [Int64]? = nil
    ) -> Int64 {
        let plates = platesHundredths ?? StandardPlates.config(for: state.unit).platesHundredths
        return PlateCalculator.platesToWeightHundredths(
            perSide: perSide(from: state.counts, platesHundredths: plates),
            config: sessionConfig(
                barHundredths: state.barHundredths,
                countBar: state.countBar,
                platesHundredths: plates
            )
        )
    }

    public static func hasLoadedPlates(_ counts: PlateCounts) -> Bool {
        counts.values.contains { $0 > 0 }
    }

    public static func snapshot(_ state: PlateSessionState) -> StoredPlateComposition {
        StoredPlateComposition(
            counts: state.counts,
            barHundredths: state.barHundredths,
            countBar: state.countBar,
            unit: state.unit
        )
    }

    public static func storedCompositionMatchesTarget(
        _ stored: StoredPlateComposition,
        targetHundredths: Int64,
        platesHundredths: [Int64]
    ) -> Bool {
        let total = PlateCalculator.platesToWeightHundredths(
            perSide: perSide(from: stored.counts, platesHundredths: platesHundredths),
            config: PlateConfig(
                barHundredths: stored.countBar ? stored.barHundredths : 0,
                platesHundredths: platesHundredths
            )
        )
        return total == targetHundredths
    }

    public static func seedPlateCounts(
        targetHundredths: Int64,
        unit: WeightUnit,
        barHundredths: Int64,
        countBar: Bool,
        platesHundredths: [Int64],
        stored: StoredPlateComposition? = nil
    ) -> PlateCounts {
        if let stored,
           stored.unit == unit,
           stored.countBar == countBar,
           stored.barHundredths == barHundredths,
           storedCompositionMatchesTarget(
               stored,
               targetHundredths: targetHundredths,
               platesHundredths: platesHundredths
           )
        {
            return stored.counts
        }
        let solved = PlateCalculator.solveWeightToPlates(
            targetHundredths: targetHundredths,
            config: PlateConfig(
                barHundredths: countBar ? barHundredths : 0,
                platesHundredths: platesHundredths
            )
        )
        return solved.feasible ? plateCounts(from: solved.perSide) : [:]
    }

    public static func createSession(
        targetHundredths: Int64,
        unit: WeightUnit,
        barWeightHundredths: Int64,
        countBar: Bool = true,
        stored: StoredPlateComposition? = nil
    ) -> PlateSessionState {
        let plates = StandardPlates.config(for: unit).platesHundredths
        let targetDraft = draftForTotal(targetHundredths, unit: unit)
        if let stored,
           stored.unit == unit,
           storedCompositionMatchesTarget(
               stored,
               targetHundredths: targetHundredths,
               platesHundredths: plates
           )
        {
            return PlateSessionState(
                mode: .toPlates,
                draft: targetDraft,
                countBar: stored.countBar,
                barHundredths: stored.barHundredths,
                barDraft: Weight(hundredths: stored.barHundredths, unit: unit).formattedValue,
                counts: stored.counts,
                unit: unit
            )
        }

        return PlateSessionState(
            mode: .toPlates,
            draft: targetDraft,
            countBar: countBar,
            barHundredths: barWeightHundredths,
            barDraft: Weight(hundredths: barWeightHundredths, unit: unit).formattedValue,
            counts: seedPlateCounts(
                targetHundredths: targetHundredths,
                unit: unit,
                barHundredths: barWeightHundredths,
                countBar: countBar,
                platesHundredths: plates,
                stored: nil
            ),
            unit: unit
        )
    }

    public static func reduce(
        _ state: PlateSessionState,
        action: PlateSessionAction
    ) -> PlateSessionState {
        let plates = StandardPlates.config(for: state.unit).platesHundredths
        switch action {
        case let .setMode(mode):
            var next = state
            next.mode = mode
            return next

        case let .setTargetDraft(value):
            var next = state
            let draft = sanitizeDecimal(value)
            next.draft = draft
            let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, let numeric = Double(trimmed), numeric.isFinite else {
                return next
            }
            let solved = PlateCalculator.solveWeightToPlates(
                target: numeric,
                config: sessionConfig(
                    barHundredths: state.barHundredths,
                    countBar: state.countBar,
                    platesHundredths: plates
                )
            )
            next.counts = solved.feasible ? plateCounts(from: solved.perSide) : [:]
            return next

        case let .changeCount(plateHundredths, delta):
            var next = state
            next.counts = changePlateCount(state.counts, plateHundredths: plateHundredths, delta: delta)
            next.draft = draftForTotal(sessionTotalHundredths(next, platesHundredths: plates), unit: next.unit)
            return next

        case .clearPlates:
            var next = state
            next.counts = [:]
            next.draft = draftForTotal(sessionTotalHundredths(next, platesHundredths: plates), unit: next.unit)
            return next

        case let .setCountBar(countBar):
            var next = state
            next.countBar = countBar
            next.draft = draftForTotal(sessionTotalHundredths(next, platesHundredths: plates), unit: next.unit)
            return next

        case let .selectBar(barHundredths):
            var next = state
            next.barHundredths = barHundredths
            next.barDraft = Weight(hundredths: barHundredths, unit: next.unit).formattedValue
            next.draft = draftForTotal(sessionTotalHundredths(next, platesHundredths: plates), unit: next.unit)
            return next

        case let .setBarDraft(value):
            var next = state
            let barDraft = sanitizeDecimal(value)
            next.barDraft = barDraft
            if !barDraft.isEmpty, let numeric = Double(barDraft), numeric.isFinite {
                next.barHundredths = Int64((numeric * 100.0).rounded())
            }
            next.draft = draftForTotal(sessionTotalHundredths(next, platesHundredths: plates), unit: next.unit)
            return next
        }
    }

    private static func draftForTotal(_ totalHundredths: Int64, unit: WeightUnit) -> String {
        totalHundredths > 0 ? Weight(hundredths: totalHundredths, unit: unit).formattedValue : ""
    }
}
