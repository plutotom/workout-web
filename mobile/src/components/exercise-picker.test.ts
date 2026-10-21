import { describe, expect, it, vi } from "vitest";

vi.mock("./exercise-picker/chrome", () => ({
  useExercisePickerStyle: () => "current",
}));
vi.mock("./exercise-picker/current", () => ({
  CurrentExercisePicker: "Current",
}));
vi.mock("./exercise-picker/recents-search", () => ({
  RecentsSearchPicker: "Recents",
}));
vi.mock("./exercise-picker/sectioned-index", () => ({
  SectionedIndexPicker: "Sectioned",
}));
vi.mock("./exercise-picker/category-drilldown", () => ({
  CategoryDrilldownPicker: "Drilldown",
}));
vi.mock("./exercise-picker/command-palette", () => ({
  CommandPalettePicker: "Palette",
}));
vi.mock("./exercise-picker/detent-sheet", () => ({
  DetentSheetPicker: "Sheet",
}));
vi.mock("./exercise-picker/card-grid", () => ({
  CardGridPicker: "Grid",
}));

import { pickerComponentForStyle } from "./exercise-picker";
import { EXERCISE_PICKER_STYLES } from "@/lib/exercise-picker-style";

const VARIANTS = {
  current: "Current",
  recents: "Recents",
  sectioned: "Sectioned",
  drilldown: "Drilldown",
  palette: "Palette",
  sheet: "Sheet",
  grid: "Grid",
} as const;

describe("exercise picker router", () => {
  it("maps every switcher id to a real component", () => {
    for (const style of EXERCISE_PICKER_STYLES) {
      expect(pickerComponentForStyle(style.id)).toBe(VARIANTS[style.id]);
    }
  });

  it("falls back to the shipping picker for a stale id", () => {
    expect(pickerComponentForStyle("missing" as never)).toBe("Current");
  });
});
