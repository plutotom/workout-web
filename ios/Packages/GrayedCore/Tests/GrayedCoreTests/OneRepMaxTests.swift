import Foundation
import Testing
@testable import GrayedCore

@Suite("OneRepMax Epley calculations")
struct OneRepMaxTests {
    @Test("returns nil for invalid weight or reps")
    func invalidInputs() {
        #expect(OneRepMax.estimate(weight: Weight(hundredths: 0, unit: .lb), reps: 5) == nil)
        #expect(OneRepMax.estimate(weight: Weight(hundredths: -100, unit: .lb), reps: 5) == nil)
        #expect(OneRepMax.estimate(weight: Weight(hundredths: 13500, unit: .lb), reps: 0) == nil)
        #expect(OneRepMax.predictedWeight(oneRM: Weight(hundredths: 0, unit: .lb), reps: 5) == nil)
        #expect(OneRepMax.predictedWeight(oneRM: Weight(hundredths: 30000, unit: .lb), reps: 0) == nil)
    }

    @Test("returns rounded weight for 1RM single")
    func singleRep() {
        let est = OneRepMax.estimate(weight: Weight(hundredths: 22500, unit: .lb), reps: 1)
        #expect(est == Weight(hundredths: 22500, unit: .lb))
    }

    @Test("computes Epley 1RM for multi-rep sets preserving unit")
    func multiRep() {
        // 225 * (1 + 5/30) = 262.5 -> 263
        let estLb = OneRepMax.estimate(weight: Weight(hundredths: 22500, unit: .lb), reps: 5)
        #expect(estLb == Weight(hundredths: 26300, unit: .lb))

        // 100 * (1 + 10/30) = 133.33 -> 133
        let estKg = OneRepMax.estimate(weight: Weight(hundredths: 10000, unit: .kg), reps: 10)
        #expect(estKg == Weight(hundredths: 13300, unit: .kg))
    }

    @Test("predicts working weight from 1RM via reverse Epley")
    func reverseEpley() {
        // 300 / (1 + 5/30) = 257.14 -> 257
        let pred = OneRepMax.predictedWeight(oneRM: Weight(hundredths: 30000, unit: .lb), reps: 5)
        #expect(pred == Weight(hundredths: 25700, unit: .lb))

        let single = OneRepMax.predictedWeight(oneRM: Weight(hundredths: 30000, unit: .lb), reps: 1)
        #expect(single == Weight(hundredths: 30000, unit: .lb))
    }
}
