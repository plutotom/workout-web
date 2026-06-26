export type MuscleGroup =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "core";

export type Exercise = {
  slug: string;
  name: string;
  short: string;
  category: MuscleGroup;
};

export const MUSCLE_GROUPS: { id: MuscleGroup; label: string }[] = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "legs", label: "Legs" },
  { id: "shoulders", label: "Shoulders" },
  { id: "arms", label: "Arms" },
  { id: "core", label: "Core" },
];

export const EXERCISES: Exercise[] = [
  // Chest
  {
    slug: "bench",
    name: "Bench Press (Barbell)",
    short: "Bench",
    category: "chest",
  },
  {
    slug: "incline-bench-bb",
    name: "Incline Bench Press (Barbell)",
    short: "Incline Bench",
    category: "chest",
  },
  {
    slug: "db-bench",
    name: "Bench Press (Dumbbell)",
    short: "Bench",
    category: "chest",
  },
  {
    slug: "incline-db-press",
    name: "Incline Press (Dumbbell)",
    short: "Incline Press",
    category: "chest",
  },
  {
    slug: "chest-fly-db",
    name: "Chest Fly (Dumbbell)",
    short: "Chest Fly",
    category: "chest",
  },
  {
    slug: "cable-fly",
    name: "Cable Fly",
    short: "Cable Fly",
    category: "chest",
  },
  {
    slug: "machine-chest-press",
    name: "Chest Press (Machine)",
    short: "Chest Press",
    category: "chest",
  },
  { slug: "pushup", name: "Push-up", short: "Push-up", category: "chest" },
  { slug: "dips", name: "Dips", short: "Dips", category: "chest" },
  // Back
  {
    slug: "deadlift",
    name: "Deadlift (Barbell)",
    short: "Deadlift",
    category: "back",
  },
  {
    slug: "barbell-row",
    name: "Bent-Over Row (Barbell)",
    short: "Bent-Over Row",
    category: "back",
  },
  {
    slug: "pendlay-row",
    name: "Pendlay Row (Barbell)",
    short: "Pendlay Row",
    category: "back",
  },
  {
    slug: "db-row",
    name: "Row (Dumbbell)",
    short: "Row",
    category: "back",
  },
  { slug: "pullup", name: "Pull-up", short: "Pull-up", category: "back" },
  { slug: "chinup", name: "Chin-up", short: "Chin-up", category: "back" },
  {
    slug: "lat-pulldown",
    name: "Lat Pulldown (Cable)",
    short: "Lat Pulldown",
    category: "back",
  },
  {
    slug: "seated-cable-row",
    name: "Seated Row (Cable)",
    short: "Seated Row",
    category: "back",
  },
  {
    slug: "tbar-row",
    name: "T-Bar Row",
    short: "T-Bar Row",
    category: "back",
  },
  {
    slug: "rack-pull",
    name: "Rack Pull (Barbell)",
    short: "Rack Pull",
    category: "back",
  },
  {
    slug: "face-pull",
    name: "Face Pull (Cable)",
    short: "Face Pull",
    category: "back",
  },
  // Legs
  {
    slug: "squat",
    name: "Squat (Barbell)",
    short: "Squat",
    category: "legs",
  },
  {
    slug: "front-squat",
    name: "Front Squat (Barbell)",
    short: "Front Squat",
    category: "legs",
  },
  {
    slug: "rdl",
    name: "Romanian Deadlift (Barbell)",
    short: "Romanian Deadlift",
    category: "legs",
  },
  {
    slug: "leg-press",
    name: "Leg Press (Machine)",
    short: "Leg Press",
    category: "legs",
  },
  {
    slug: "leg-extension",
    name: "Leg Extension (Machine)",
    short: "Leg Extension",
    category: "legs",
  },
  {
    slug: "leg-curl",
    name: "Leg Curl (Machine)",
    short: "Leg Curl",
    category: "legs",
  },
  {
    slug: "lunge",
    name: "Lunge (Dumbbell)",
    short: "Lunge",
    category: "legs",
  },
  {
    slug: "bulgarian-split-squat",
    name: "Bulgarian Split Squat (Dumbbell)",
    short: "Bulgarian Split Squat",
    category: "legs",
  },
  {
    slug: "hip-thrust",
    name: "Hip Thrust (Barbell)",
    short: "Hip Thrust",
    category: "legs",
  },
  {
    slug: "goblet-squat",
    name: "Goblet Squat (Dumbbell)",
    short: "Goblet Squat",
    category: "legs",
  },
  {
    slug: "calf-raise",
    name: "Calf Raise",
    short: "Calf Raise",
    category: "legs",
  },
  // Shoulders
  {
    slug: "ohp",
    name: "Overhead Press (Barbell)",
    short: "Overhead Press",
    category: "shoulders",
  },
  {
    slug: "db-shoulder-press",
    name: "Shoulder Press (Dumbbell)",
    short: "Shoulder Press",
    category: "shoulders",
  },
  {
    slug: "arnold-press",
    name: "Arnold Press (Dumbbell)",
    short: "Arnold Press",
    category: "shoulders",
  },
  {
    slug: "lateral-raise",
    name: "Lateral Raise (Dumbbell)",
    short: "Lateral Raise",
    category: "shoulders",
  },
  {
    slug: "front-raise",
    name: "Front Raise (Dumbbell)",
    short: "Front Raise",
    category: "shoulders",
  },
  {
    slug: "rear-delt-fly",
    name: "Rear Delt Fly (Dumbbell)",
    short: "Rear Delt Fly",
    category: "shoulders",
  },
  {
    slug: "upright-row",
    name: "Upright Row (Barbell)",
    short: "Upright Row",
    category: "shoulders",
  },
  {
    slug: "shrug",
    name: "Shrug (Dumbbell)",
    short: "Shrug",
    category: "shoulders",
  },
  // Arms
  {
    slug: "barbell-curl",
    name: "Curl (Barbell)",
    short: "Curl",
    category: "arms",
  },
  {
    slug: "bicep-curl",
    name: "Bicep Curl (Dumbbell)",
    short: "Bicep Curl",
    category: "arms",
  },
  {
    slug: "hammer-curl",
    name: "Hammer Curl (Dumbbell)",
    short: "Hammer Curl",
    category: "arms",
  },
  {
    slug: "preacher-curl",
    name: "Preacher Curl",
    short: "Preacher Curl",
    category: "arms",
  },
  {
    slug: "tricep-pushdown",
    name: "Tricep Pushdown (Cable)",
    short: "Tricep Pushdown",
    category: "arms",
  },
  {
    slug: "overhead-tricep-ext",
    name: "Overhead Extension (Dumbbell)",
    short: "Overhead Extension",
    category: "arms",
  },
  {
    slug: "skullcrusher",
    name: "Skullcrusher (Barbell)",
    short: "Skullcrusher",
    category: "arms",
  },
  {
    slug: "close-grip-bench",
    name: "Close-Grip Bench Press (Barbell)",
    short: "Close-Grip Bench Press",
    category: "arms",
  },
  // Core
  { slug: "plank", name: "Plank", short: "Plank", category: "core" },
  {
    slug: "hanging-leg-raise",
    name: "Hanging Leg Raise",
    short: "Hanging Leg Raise",
    category: "core",
  },
  {
    slug: "cable-crunch",
    name: "Cable Crunch",
    short: "Cable Crunch",
    category: "core",
  },
  { slug: "situp", name: "Sit-up", short: "Sit-up", category: "core" },
  {
    slug: "russian-twist",
    name: "Russian Twist",
    short: "Russian Twist",
    category: "core",
  },
  {
    slug: "ab-wheel",
    name: "Ab Wheel Rollout",
    short: "Ab Wheel Rollout",
    category: "core",
  },
];

const bySlug = new Map(EXERCISES.map((e) => [e.slug, e]));

export const exerciseName = (slug: string) => bySlug.get(slug)?.name ?? slug;

export const exerciseShort = (slug: string) => bySlug.get(slug)?.short ?? slug;

/** True for barbell (and similar) lifts where plate math includes the bar. */
export function exerciseUsesBar(slug: string): boolean {
  const name = bySlug.get(slug)?.name;
  if (!name) return true;
  return !name.includes("(Dumbbell)");
}

export function searchExercises(
  query: string,
  group: MuscleGroup | "all",
): Exercise[] {
  const q = query.trim().toLowerCase();
  return EXERCISES.filter((e) => {
    if (group !== "all" && e.category !== group) return false;
    if (!q) return true;
    return e.name.toLowerCase().includes(q);
  });
}
