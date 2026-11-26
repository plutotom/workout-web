import Foundation

/// Estimated one-rep max and reverse rep predictions using the Epley formula.
public enum OneRepMax {
    /// Epley formula: `weight * (1 + reps / 30)`, rounded to the nearest whole unit.
    /// Returns `nil` when weight <= 0 or reps <= 0.
    public static func estimate(weight: Weight, reps: Int) -> Weight? {
        guard weight.hundredths > 0, reps > 0 else { return nil }
        if reps == 1 {
            let roundedWhole = Int64(weight.value.rounded()) * 100
            return Weight(hundredths: roundedWhole, unit: weight.unit)
        }
        let estimated = (weight.value * (1.0 + Double(reps) / 30.0)).rounded()
        return Weight(hundredths: Int64(estimated) * 100, unit: weight.unit)
    }

    /// Reverse Epley: predicted working weight for `reps` given an estimated 1RM.
    /// Returns `nil` when `oneRM <= 0` or `reps <= 0`.
    public static func predictedWeight(oneRM: Weight, reps: Int) -> Weight? {
        guard oneRM.hundredths > 0, reps > 0 else { return nil }
        if reps == 1 {
            let roundedWhole = Int64(oneRM.value.rounded()) * 100
            return Weight(hundredths: roundedWhole, unit: oneRM.unit)
        }
        let predicted = (oneRM.value / (1.0 + Double(reps) / 30.0)).rounded()
        return Weight(hundredths: Int64(predicted) * 100, unit: oneRM.unit)
    }
}
