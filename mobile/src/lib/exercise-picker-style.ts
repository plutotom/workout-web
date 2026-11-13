/** Dev-only: swap add-exercise picker prototypes without shipping them. */

declare const __DEV__: boolean | undefined;

export const EXERCISE_PICKER_STYLES = [
  {
    id: "current",
    label: "Current",
    summary: "Full page sheet, muscle chips, multi-select, confirm to add.",
  },
  {
    id: "recents",
    label: "Recents first",
    summary: "Search-first sheet with recent and frequent lifts on top.",
  },
  {
    id: "sectioned",
    label: "Sectioned index",
    summary: "Grouped by muscle with sticky headers and a jump index.",
  },
  {
    id: "drilldown",
    label: "Category drill-down",
    summary:
      "Pick a muscle group, then an exercise. Search skips the first step.",
  },
  {
    id: "palette",
    label: "Command palette",
    summary: "Spotlight-style search. Tap adds immediately and stays open.",
  },
  {
    id: "sheet",
    label: "Detent sheet",
    summary:
      "Draggable bottom sheet (peek / half / full) with recents in peek.",
  },
  {
    id: "grid",
    label: "Card grid",
    summary: "Two-column cards with equipment chips and multi-select.",
  },
] as const;

export type ExercisePickerStyle = (typeof EXERCISE_PICKER_STYLES)[number]["id"];

const DEFAULT_STYLE: ExercisePickerStyle = "current";
const STYLE_IDS = new Set<string>(
  EXERCISE_PICKER_STYLES.map((style) => style.id),
);

let memoryStyle: ExercisePickerStyle = DEFAULT_STYLE;
const listeners = new Set<() => void>();

export function exercisePickerStyleAllowed(): boolean {
  const nodeEnvironment =
    typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
  if (nodeEnvironment === "production") return false;
  if (typeof __DEV__ !== "undefined") return __DEV__ === true;
  return nodeEnvironment === "development";
}

function parseStyle(raw: string | null | undefined): ExercisePickerStyle {
  if (raw && STYLE_IDS.has(raw)) return raw as ExercisePickerStyle;
  return DEFAULT_STYLE;
}

export function readExercisePickerStyle(): ExercisePickerStyle {
  if (!exercisePickerStyleAllowed()) return DEFAULT_STYLE;
  return parseStyle(memoryStyle);
}

export function writeExercisePickerStyle(value: ExercisePickerStyle): void {
  if (!exercisePickerStyleAllowed()) return;
  memoryStyle = parseStyle(value);
  for (const listener of listeners) listener();
}

export function subscribeExercisePickerStyle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function exercisePickerStyleLabel(id: ExercisePickerStyle): string {
  return EXERCISE_PICKER_STYLES.find((style) => style.id === id)?.label ?? id;
}
