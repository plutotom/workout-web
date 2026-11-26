import Foundation
import Testing
@testable import GrayedCore

@Suite("Weight fixed-point and conversion")
struct WeightTests {
    @Test("stores fixed-point hundredths without floating point drift")
    func storesFixedPointHundredths() {
        let w = Weight(value: 132.5, unit: .lb)
        #expect(w.hundredths == 13250)
        #expect(w.value == 132.5)
        #expect(w.unit == .lb)

        let micro = Weight(value: 1.25, unit: .kg)
        #expect(micro.hundredths == 125)
        #expect(micro.formattedValue == "1.25")
        #expect(micro.formattedWithUnit == "1.25 kg")
    }

    @Test("formats whole, tenths, and hundredths cleanly")
    func formatsCleanly() {
        #expect(Weight(hundredths: 22500, unit: .lb).formattedValue == "225")
        #expect(Weight(hundredths: 250, unit: .lb).formattedValue == "2.5")
        #expect(Weight(hundredths: 125, unit: .kg).formattedValue == "1.25")
        #expect(Weight(hundredths: 105, unit: .kg).formattedValue == "1.05")
        #expect(Weight(hundredths: 0, unit: .lb).formattedValue == "0")
    }

    @Test("converts only for display and preserves original stored weight")
    func convertsForDisplay() {
        let storedKg = Weight(hundredths: 10000, unit: .kg)
        let displayLb = storedKg.converted(to: .lb)

        #expect(storedKg.hundredths == 10000)
        #expect(storedKg.unit == .kg)
        #expect(displayLb.unit == .lb)
        #expect(displayLb.hundredths == 22046)

        let same = storedKg.converted(to: .kg)
        #expect(same == storedKg)

        let storedLb = Weight(hundredths: 22500, unit: .lb)
        let displayKg = storedLb.converted(to: .kg)
        #expect(displayKg.unit == .kg)
        #expect(displayKg.hundredths == 10206)
    }

    @Test("compares weights across units")
    func comparesAcrossUnits() {
        let hundredKg = Weight(hundredths: 10000, unit: .kg)
        let twoHundredLb = Weight(hundredths: 20000, unit: .lb)
        #expect(twoHundredLb < hundredKg)
    }
}
