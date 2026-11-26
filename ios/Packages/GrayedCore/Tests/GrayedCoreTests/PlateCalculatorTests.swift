import Foundation
import Testing
@testable import GrayedCore

@Suite("PlateCalculator solver (ported from solver.test.ts)")
struct PlateCalculatorSolverTests {
    let lb = StandardPlates.lb
    let kg = StandardPlates.kg

    @Test("loads 225 lb as two 45s per side")
    func loads225Lb() {
        let r = PlateCalculator.solveWeightToPlates(target: 225, config: lb)
        #expect(r.exact == true)
        #expect(r.loadedTotal == 225)
        #expect(r.perSide == [PlateCount(plate: 45, count: 2)])
    }

    @Test("loads 135 lb as one 45 per side")
    func loads135Lb() {
        let r = PlateCalculator.solveWeightToPlates(target: 135, config: lb)
        #expect(r.exact == true)
        #expect(r.perSide == [PlateCount(plate: 45, count: 1)])
    }

    @Test("returns no plates for an empty bar")
    func emptyBar() {
        let r = PlateCalculator.solveWeightToPlates(target: 45, config: lb)
        #expect(r.feasible == true)
        #expect(r.exact == true)
        #expect(r.perSide.isEmpty)
    }

    @Test("uses 25 + 2.5 per side for 100 lb")
    func loads100Lb() {
        let r = PlateCalculator.solveWeightToPlates(target: 100, config: lb)
        #expect(r.exact == true)
        #expect(r.perSide == [
            PlateCount(plate: 25, count: 1),
            PlateCount(plate: 2.5, count: 1),
        ])
    }

    @Test("reports closest load and remainder for 137 lb")
    func reportsRemainderFor137Lb() {
        let r = PlateCalculator.solveWeightToPlates(target: 137, config: lb)
        #expect(r.exact == false)
        #expect(r.loadedTotal == 135)
        #expect(r.remainder == 2)
    }

    @Test("is infeasible below the bar")
    func infeasibleBelowBar() {
        let r = PlateCalculator.solveWeightToPlates(target: 30, config: lb)
        #expect(r.feasible == false)
        #expect(r.perSide.isEmpty)
    }

    @Test("loads dumbbell weight with no bar")
    func loadsDumbbellWithNoBar() {
        let r = PlateCalculator.solveWeightToPlates(
            target: 50,
            config: PlateConfig(barHundredths: 0, platesHundredths: lb.platesHundredths)
        )
        #expect(r.exact == true)
        #expect(r.loadedTotal == 50)
        #expect(r.perSide == [PlateCount(plate: 25, count: 1)])
    }

    @Test("loads 100 kg as 25 + 15 per side")
    func loads100Kg() {
        let r = PlateCalculator.solveWeightToPlates(target: 100, config: kg)
        #expect(r.exact == true)
        #expect(r.perSide == [
            PlateCount(plate: 25, count: 1),
            PlateCount(plate: 15, count: 1),
        ])
    }

    @Test("handles 1.25 kg microplates exactly")
    func handlesMicroplatesKg() {
        let r = PlateCalculator.solveWeightToPlates(target: Weight(value: 22.5, unit: .kg))
        #expect(r.exact == true)
        #expect(r.loadedTotalHundredths == 2250)
        #expect(r.perSide == [PlateCount(plateHundredths: 125, count: 1)])
    }

    @Test("platesToWeight totals two 45s per side on a 45 bar to 225")
    func platesToWeight225() {
        let perSide = [PlateCount(plate: 45, count: 2)]
        #expect(PlateCalculator.platesToWeightDouble(perSide: perSide, config: lb) == 225)
        #expect(PlateCalculator.platesToWeight(perSide: perSide, unit: .lb) == Weight(hundredths: 22500, unit: .lb))
    }

    @Test("round-trips platesToWeight with the solver")
    func roundTripsWithSolver() {
        let r = PlateCalculator.solveWeightToPlates(target: 185, config: lb)
        #expect(PlateCalculator.platesToWeightHundredths(perSide: r.perSide, config: lb) == r.loadedTotalHundredths)
    }
}

@Suite("PlateComposition session reducer (ported from composition.test.ts)")
struct PlateCompositionTests {
    let lbPlates = StandardPlates.lb.platesHundredths

    @Test("isolates unrelated lifts that reuse a set id")
    func compositionIdentity() {
        #expect(PlateComposition.compositionId(exerciseId: "bench-press", setId: "set-1") == "bench-press:set-1")
        #expect(PlateComposition.compositionId(exerciseId: "squat", setId: "set-1") == "squat:set-1")
    }

    @Test("opens 185 lb as a 45 bar plus 45 and 25 per side")
    func seeds185Lb() {
        let counts = PlateComposition.seedPlateCounts(
            targetHundredths: 18500,
            unit: .lb,
            barHundredths: 4500,
            countBar: true,
            platesHundredths: lbPlates
        )
        #expect(counts == [4500: 1, 2500: 1])
    }

    @Test("restores a non-greedy load when it still matches the target")
    func restoresNonGreedyStored() {
        let stored = StoredPlateComposition(
            counts: [3500: 1, 1000: 1],
            barHundredths: 4500,
            countBar: true,
            unit: .lb
        )
        let counts = PlateComposition.seedPlateCounts(
            targetHundredths: 13500,
            unit: .lb,
            barHundredths: 4500,
            countBar: true,
            platesHundredths: lbPlates,
            stored: stored
        )
        #expect(counts == [3500: 1, 1000: 1])
    }

    @Test("re-solves when stored plates belong to a different weight")
    func resolvesWhenStoredMismatch() {
        let stored = StoredPlateComposition(
            counts: [3500: 1, 1000: 1],
            barHundredths: 4500,
            countBar: true,
            unit: .lb
        )
        let counts = PlateComposition.seedPlateCounts(
            targetHundredths: 22500,
            unit: .lb,
            barHundredths: 4500,
            countBar: true,
            platesHundredths: lbPlates,
            stored: stored
        )
        #expect(counts == [4500: 2])
    }

    @Test("lets either mode edit plates while keeping the same bar")
    func sessionEditingAcrossModes() {
        var state = PlateComposition.createSession(
            targetHundredths: 18500,
            unit: .lb,
            barWeightHundredths: 4500
        )
        #expect(state.counts == [4500: 1, 2500: 1])
        #expect(state.barHundredths == 4500)
        #expect(PlateComposition.sessionTotalHundredths(state) == 18500)
        #expect(PlateComposition.hasLoadedPlates(state.counts) == true)

        state = PlateComposition.reduce(state, action: .changeCount(plateHundredths: 2500, delta: -1))
        #expect(state.counts == [4500: 1])
        #expect(state.draft == "135")
        #expect(PlateComposition.sessionTotalHundredths(state) == 13500)

        state = PlateComposition.reduce(state, action: .setMode(.toWeight))
        state = PlateComposition.reduce(state, action: .changeCount(plateHundredths: 1000, delta: 1))
        #expect(state.mode == .toWeight)
        #expect(state.counts == [4500: 1, 1000: 1])
        #expect(state.draft == "155")

        state = PlateComposition.reduce(state, action: .setMode(.toPlates))
        #expect(state.counts == [4500: 1, 1000: 1])
        #expect(PlateComposition.sessionTotalHundredths(state) == 15500)
    }

    @Test("re-solves from target field without losing bar setup")
    func reSolvesFromTargetDraft() {
        var state = PlateComposition.createSession(
            targetHundredths: 18500,
            unit: .lb,
            barWeightHundredths: 4500
        )
        state = PlateComposition.reduce(state, action: .setTargetDraft("225"))
        #expect(state.counts == [4500: 2])
        #expect(state.draft == "225")
        #expect(state.barHundredths == 4500)
    }

    @Test("keeps actual plates when bar preset changes")
    func keepsPlatesOnBarChange() {
        var state = PlateComposition.createSession(
            targetHundredths: 18500,
            unit: .lb,
            barWeightHundredths: 4500
        )
        state = PlateComposition.reduce(state, action: .selectBar(barHundredths: 3500))
        #expect(state.counts == [4500: 1, 2500: 1])
        #expect(PlateComposition.sessionTotalHundredths(state) == 17500)
        #expect(state.draft == "175")
    }

    @Test("round-trips plate counts and drops zeroed denominations")
    func plateCountHelpers() {
        let counts = PlateComposition.plateCounts(from: [
            PlateCount(plate: 45, count: 1),
            PlateCount(plate: 25, count: 1),
        ])
        #expect(PlateComposition.perSide(from: counts, platesHundredths: lbPlates) == [
            PlateCount(plate: 45, count: 1),
            PlateCount(plate: 25, count: 1),
        ])
        #expect(PlateComposition.changePlateCount(counts, plateHundredths: 2500, delta: -1) == [4500: 1])
    }
}
