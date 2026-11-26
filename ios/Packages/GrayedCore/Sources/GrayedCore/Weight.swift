import Foundation

public enum WeightUnit: String, Codable, Sendable, CaseIterable, Hashable {
    case lb
    case kg
}

/// Fixed-point weight stored as integer hundredths plus the entered unit.
/// Stored values are never mutated on unit conversion; use `converted(to:)` for display only.
public struct Weight: Codable, Sendable, Equatable, Hashable, Comparable {
    public static let poundsPerKilogram: Double = 2.20462262185

    /// Fixed-point integer in hundredths of `unit` (e.g. `22500` == `225.00 lb`, `125` == `1.25 kg`).
    public let hundredths: Int64
    public let unit: WeightUnit

    public init(hundredths: Int64, unit: WeightUnit) {
        self.hundredths = hundredths
        self.unit = unit
    }

    public init(value: Double, unit: WeightUnit) {
        self.hundredths = Int64((value * 100.0).rounded())
        self.unit = unit
    }

    public static func zero(_ unit: WeightUnit) -> Weight {
        Weight(hundredths: 0, unit: unit)
    }

    /// Floating-point representation for display or formula input.
    public var value: Double {
        Double(hundredths) / 100.0
    }

    /// Returns a display-converted copy in `targetUnit` without altering stored precision.
    public func converted(to targetUnit: WeightUnit) -> Weight {
        guard unit != targetUnit else { return self }
        let convertedValue: Double
        switch (unit, targetUnit) {
        case (.kg, .lb):
            convertedValue = value * Self.poundsPerKilogram
        case (.lb, .kg):
            convertedValue = value / Self.poundsPerKilogram
        case (.lb, .lb), (.kg, .kg):
            convertedValue = value
        }
        return Weight(value: convertedValue, unit: targetUnit)
    }

    /// Clean decimal string omitting unnecessary trailing zeroes (e.g. `225`, `2.5`, `1.25`).
    public var formattedValue: String {
        let sign = hundredths < 0 ? "-" : ""
        let absVal = hundredths == Int64.min ? UInt64(Int64.max) + 1 : UInt64(abs(hundredths))
        let whole = absVal / 100
        let frac = absVal % 100
        if frac == 0 {
            return "\(sign)\(whole)"
        } else if frac % 10 == 0 {
            return "\(sign)\(whole).\(frac / 10)"
        } else {
            let fracStr = frac < 10 ? "0\(frac)" : "\(frac)"
            return "\(sign)\(whole).\(fracStr)"
        }
    }

    public var formattedWithUnit: String {
        "\(formattedValue) \(unit.rawValue)"
    }

    public static func < (lhs: Weight, rhs: Weight) -> Bool {
        if lhs.unit == rhs.unit {
            return lhs.hundredths < rhs.hundredths
        }
        return lhs.converted(to: .kg).hundredths < rhs.converted(to: .kg).hundredths
    }
}
