export type ExercisePickerProps = {
  visible: boolean;
  usedSlugs: string[];
  onClose: () => void;
  onAdd: (slugs: string[]) => void;
  mode?: "add" | "replace";
};
