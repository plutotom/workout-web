import type { ComponentType } from "react";

import { CardGridPicker } from "@/components/exercise-picker/card-grid";
import { CategoryDrilldownPicker } from "@/components/exercise-picker/category-drilldown";
import { useExercisePickerStyle } from "@/components/exercise-picker/chrome";
import { CommandPalettePicker } from "@/components/exercise-picker/command-palette";
import { CurrentExercisePicker } from "@/components/exercise-picker/current";
import { DetentSheetPicker } from "@/components/exercise-picker/detent-sheet";
import { RecentsSearchPicker } from "@/components/exercise-picker/recents-search";
import { SectionedIndexPicker } from "@/components/exercise-picker/sectioned-index";
import type { ExercisePickerProps } from "@/components/exercise-picker/types";
import type { ExercisePickerStyle } from "@/lib/exercise-picker-style";

const PICKERS: Record<
  ExercisePickerStyle,
  ComponentType<ExercisePickerProps>
> = {
  current: CurrentExercisePicker,
  recents: RecentsSearchPicker,
  sectioned: SectionedIndexPicker,
  drilldown: CategoryDrilldownPicker,
  palette: CommandPalettePicker,
  sheet: DetentSheetPicker,
  grid: CardGridPicker,
};

export function pickerComponentForStyle(style: ExercisePickerStyle) {
  return PICKERS[style] ?? CurrentExercisePicker;
}

export function ExercisePicker(props: ExercisePickerProps) {
  const style = useExercisePickerStyle();
  switch (style) {
    case "recents":
      return <RecentsSearchPicker {...props} />;
    case "sectioned":
      return <SectionedIndexPicker {...props} />;
    case "drilldown":
      return <CategoryDrilldownPicker {...props} />;
    case "palette":
      return <CommandPalettePicker {...props} />;
    case "sheet":
      return <DetentSheetPicker {...props} />;
    case "grid":
      return <CardGridPicker {...props} />;
    case "current":
      return <CurrentExercisePicker {...props} />;
    default: {
      style satisfies never;
      return <CurrentExercisePicker {...props} />;
    }
  }
}

export type { ExercisePickerProps };
