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
  // Explicit barbell flag (custom exercises). Curated lifts leave this unset and
  // derive it from the name; see exerciseUsesBar.
  usesBar?: boolean;
  // Custom exercises only: hidden from pickers but still name-resolvable.
  archived?: boolean;
  custom?: boolean;
};

/** A custom (user-authored) exercise as returned by the backend catalog query. */
export type CustomExerciseEntry = {
  slug: string;
  name: string;
  short?: string;
  category: MuscleGroup;
  usesBar: boolean;
  archived: boolean;
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
    slug: "band-chest-press",
    name: "Band Chest Press",
    short: "Band Chest Press",
    category: "chest",
  },
  {
    slug: "bench-press-wide-grip-barbell",
    name: "Bench Press - Wide Grip (Barbell)",
    short: "Wide Grip Bench",
    category: "chest",
  },
  {
    slug: "bench",
    name: "Bench Press (Barbell)",
    short: "Bench",
    category: "chest",
  },
  {
    slug: "bench-press-cable",
    name: "Bench Press (Cable)",
    short: "Bench",
    category: "chest",
  },
  {
    slug: "db-bench",
    name: "Bench Press (Dumbbell)",
    short: "Bench",
    category: "chest",
  },
  {
    slug: "bench-press-smith-machine",
    name: "Bench Press (Smith Machine)",
    short: "Bench",
    category: "chest",
  },
  {
    slug: "butterfly-pec-deck",
    name: "Butterfly (Pec Deck)",
    short: "Butterfly",
    category: "chest",
  },
  {
    slug: "cable-fly",
    name: "Cable Fly",
    short: "Cable Fly",
    category: "chest",
  },
  {
    slug: "chest-fly-band",
    name: "Chest Fly (Band)",
    short: "Chest Fly",
    category: "chest",
  },
  {
    slug: "chest-fly-db",
    name: "Chest Fly (Dumbbell)",
    short: "Chest Fly",
    category: "chest",
  },
  {
    slug: "chest-fly-machine",
    name: "Chest Fly (Machine)",
    short: "Chest Fly",
    category: "chest",
  },
  {
    slug: "chest-fly-suspension",
    name: "Chest Fly (Suspension)",
    short: "Chest Fly",
    category: "chest",
  },
  {
    slug: "chest-press-band",
    name: "Chest Press (Band)",
    short: "Chest Press",
    category: "chest",
  },
  {
    slug: "machine-chest-press",
    name: "Chest Press (Machine)",
    short: "Chest Press",
    category: "chest",
  },
  {
    slug: "decline-bench-press-barbell",
    name: "Decline Bench Press (Barbell)",
    short: "Decline Bench",
    category: "chest",
  },
  {
    slug: "decline-bench-press-dumbbell",
    name: "Decline Bench Press (Dumbbell)",
    short: "Decline Bench",
    category: "chest",
  },
  {
    slug: "decline-bench-press-machine",
    name: "Decline Bench Press (Machine)",
    short: "Decline Bench",
    category: "chest",
  },
  {
    slug: "decline-bench-press-smith-machine",
    name: "Decline Bench Press (Smith Machine)",
    short: "Decline Bench",
    category: "chest",
  },
  {
    slug: "decline-chest-fly-dumbbell",
    name: "Decline Chest Fly (Dumbbell)",
    short: "Decline Fly",
    category: "chest",
  },
  {
    slug: "dips",
    name: "Dips",
    short: "Dips",
    category: "chest",
  },
  {
    slug: "dumbbell-squeeze-press",
    name: "Dumbbell Squeeze Press",
    short: "Dumbbell Squeeze Press",
    category: "chest",
  },
  {
    slug: "feet-up-bench-press-barbell",
    name: "Feet Up Bench Press (Barbell)",
    short: "Feet Up Bench Press",
    category: "chest",
  },
  {
    slug: "floor-press-barbell",
    name: "Floor Press (Barbell)",
    short: "Floor Press",
    category: "chest",
  },
  {
    slug: "floor-press-dumbbell",
    name: "Floor Press (Dumbbell)",
    short: "Floor Press",
    category: "chest",
  },
  {
    slug: "hex-press-dumbbell",
    name: "Hex Press (Dumbbell)",
    short: "Hex Press",
    category: "chest",
  },
  {
    slug: "incline-bench-bb",
    name: "Incline Bench Press (Barbell)",
    short: "Incline Bench",
    category: "chest",
  },
  {
    slug: "incline-bench-press-smith-machine",
    name: "Incline Bench Press (Smith Machine)",
    short: "Incline Bench",
    category: "chest",
  },
  {
    slug: "incline-chest-fly-dumbbell",
    name: "Incline Chest Fly (Dumbbell)",
    short: "Incline Fly",
    category: "chest",
  },
  {
    slug: "incline-chest-press-machine",
    name: "Incline Chest Press (Machine)",
    short: "Incline Chest Press",
    category: "chest",
  },
  {
    slug: "incline-db-press",
    name: "Incline Press (Dumbbell)",
    short: "Incline Press",
    category: "chest",
  },
  {
    slug: "lying-leg-curl-machine",
    name: "Lying Leg Curl (Machine)",
    short: "Lying Leg Curl",
    category: "chest",
  },
  {
    slug: "plate-press",
    name: "Plate Press",
    short: "Plate Press",
    category: "chest",
  },
  {
    slug: "plate-squeeze-svend-press",
    name: "Plate Squeeze (Svend Press)",
    short: "Plate Squeeze",
    category: "chest",
  },
  {
    slug: "pushup",
    name: "Push-up",
    short: "Push-up",
    category: "chest",
  },
  {
    slug: "wide-elbow-triceps-press-dumbbell",
    name: "Wide-Elbow Triceps Press (Dumbbell)",
    short: "Wide-Elbow Triceps Press",
    category: "chest",
  },

  // Back
  {
    slug: "band-pullaparts",
    name: "Band Pullaparts",
    short: "Band Pullaparts",
    category: "back",
  },
  {
    slug: "bent-over-row-band",
    name: "Bent Over Row (Band)",
    short: "Bent-Over Row",
    category: "back",
  },
  {
    slug: "bent-over-row-dumbbell",
    name: "Bent Over Row (Dumbbell)",
    short: "Bent-Over Row",
    category: "back",
  },
  {
    slug: "barbell-row",
    name: "Bent-Over Row (Barbell)",
    short: "Bent-Over Row",
    category: "back",
  },
  {
    slug: "chest-supported-incline-row-dumbbell",
    name: "Chest Supported Incline Row (Dumbbell)",
    short: "Chest Supported Incline Row",
    category: "back",
  },
  {
    slug: "chest-supported-reverse-fly-dumbbell",
    name: "Chest Supported Reverse Fly (Dumbbell)",
    short: "Chest Supported Reverse Fly",
    category: "back",
  },
  {
    slug: "chin-up-weighted",
    name: "Chin Up (Weighted)",
    short: "Chin Up",
    category: "back",
  },
  {
    slug: "chinup",
    name: "Chin-up",
    short: "Chin-up",
    category: "back",
  },
  {
    slug: "clean-pull",
    name: "Clean Pull",
    short: "Clean Pull",
    category: "back",
  },
  {
    slug: "deadlift",
    name: "Deadlift (Barbell)",
    short: "Deadlift",
    category: "back",
  },
  {
    slug: "face-pull",
    name: "Face Pull (Cable)",
    short: "Face Pull",
    category: "back",
  },
  {
    slug: "gorillia-row-kettlebell",
    name: "Gorillia Row (Kettlebell)",
    short: "Gorillia Row",
    category: "back",
  },
  {
    slug: "inverted-row",
    name: "Inverted Row",
    short: "Inverted Row",
    category: "back",
  },
  {
    slug: "iso-lateral-chest-press-machine",
    name: "Iso-Lateral Chest Press (Machine)",
    short: "Iso Chest Press",
    category: "back",
  },
  {
    slug: "iso-lateral-high-row-machine",
    name: "Iso-Lateral High Row (Machine)",
    short: "Iso High Row",
    category: "back",
  },
  {
    slug: "iso-lateral-low-row",
    name: "Iso-Lateral Low Row",
    short: "Iso Low Row",
    category: "back",
  },
  {
    slug: "iso-lateral-row-machine",
    name: "Iso-Lateral Row (Machine)",
    short: "Iso Row",
    category: "back",
  },
  {
    slug: "kettlebell-high-pull",
    name: "Kettlebell High Pull",
    short: "Kettlebell High Pull",
    category: "back",
  },
  {
    slug: "kipping-pull-up",
    name: "Kipping Pull Up",
    short: "Kipping Pull Up",
    category: "back",
  },
  {
    slug: "kneeling-pulldown-band",
    name: "Kneeling Pulldown (band)",
    short: "Kneeling Pulldown",
    category: "back",
  },
  {
    slug: "landmine-row",
    name: "Landmine Row",
    short: "Landmine Row",
    category: "back",
  },
  {
    slug: "lat-pulldown-close-grip-cable",
    name: "Lat Pulldown - Close Grip (Cable)",
    short: "Close Grip Pulldown",
    category: "back",
  },
  {
    slug: "lat-pulldown-band",
    name: "Lat Pulldown (Band)",
    short: "Lat Pulldown",
    category: "back",
  },
  {
    slug: "lat-pulldown",
    name: "Lat Pulldown (Cable)",
    short: "Lat Pulldown",
    category: "back",
  },
  {
    slug: "lat-pulldown-machine",
    name: "Lat Pulldown (Machine)",
    short: "Lat Pulldown",
    category: "back",
  },
  {
    slug: "meadows-rows-barbell",
    name: "Meadows Rows (Barbell)",
    short: "Meadows Rows",
    category: "back",
  },
  {
    slug: "negative-pull-up",
    name: "Negative Pull Up",
    short: "Negative Pull Up",
    category: "back",
  },
  {
    slug: "pendlay-row",
    name: "Pendlay Row (Barbell)",
    short: "Pendlay Row",
    category: "back",
  },
  {
    slug: "pull-up-weighted",
    name: "Pull Up (Weighted)",
    short: "Pull Up",
    category: "back",
  },
  {
    slug: "pullup",
    name: "Pull-up",
    short: "Pull-up",
    category: "back",
  },
  {
    slug: "pullover-dumbbell",
    name: "Pullover (Dumbbell)",
    short: "Pullover",
    category: "back",
  },
  {
    slug: "pullover-machine",
    name: "Pullover (Machine)",
    short: "Pullover",
    category: "back",
  },
  {
    slug: "rack-pull",
    name: "Rack Pull (Barbell)",
    short: "Rack Pull",
    category: "back",
  },
  {
    slug: "rear-delt-reverse-fly-cable",
    name: "Rear Delt Reverse Fly (Cable)",
    short: "Rear Delt Fly",
    category: "back",
  },
  {
    slug: "rear-delt-reverse-fly-machine",
    name: "Rear Delt Reverse Fly (Machine)",
    short: "Rear Delt Fly",
    category: "back",
  },
  {
    slug: "rear-kick-machine",
    name: "Rear Kick (Machine)",
    short: "Rear Kick",
    category: "back",
  },
  {
    slug: "renegade-row-dumbbell",
    name: "Renegade Row (Dumbbell)",
    short: "Renegade Row",
    category: "back",
  },
  {
    slug: "reverse-fly-single-arm-cable",
    name: "Reverse Fly Single Arm (Cable)",
    short: "Reverse Fly Single Arm",
    category: "back",
  },
  {
    slug: "reverse-grip-lat-pulldown-cable",
    name: "Reverse Grip Lat Pulldown (Cable)",
    short: "Reverse Grip Lat Pulldown",
    category: "back",
  },
  {
    slug: "rope-straight-arm-pulldown",
    name: "Rope Straight Arm Pulldown",
    short: "Rope Straight Arm Pulldown",
    category: "back",
  },
  {
    slug: "db-row",
    name: "Row (Dumbbell)",
    short: "Row",
    category: "back",
  },
  {
    slug: "scapular-pull-ups",
    name: "Scapular Pull Ups",
    short: "Scapular Pull Ups",
    category: "back",
  },
  {
    slug: "seated-cable-row-bar-grip",
    name: "Seated Cable Row - Bar Grip",
    short: "Seated Row",
    category: "back",
  },
  {
    slug: "seated-cable-row-bar-wide-grip",
    name: "Seated Cable Row - Bar Wide Grip",
    short: "Seated Row",
    category: "back",
  },
  {
    slug: "seated-cable-row-v-grip-cable",
    name: "Seated Cable Row - V Grip (Cable)",
    short: "Seated Row",
    category: "back",
  },
  {
    slug: "seated-cable-row",
    name: "Seated Row (Cable)",
    short: "Seated Row",
    category: "back",
  },
  {
    slug: "seated-row-machine",
    name: "Seated Row (Machine)",
    short: "Seated Row",
    category: "back",
  },
  {
    slug: "single-arm-cable-crossover",
    name: "Single Arm Cable Crossover",
    short: "Single Arm Cable Crossover",
    category: "back",
  },
  {
    slug: "single-arm-cable-row",
    name: "Single Arm Cable Row",
    short: "Single Arm Cable Row",
    category: "back",
  },
  {
    slug: "single-arm-lat-pulldown",
    name: "Single Arm Lat Pulldown",
    short: "Single Arm Lat Pulldown",
    category: "back",
  },
  {
    slug: "straight-arm-lat-pulldown-cable",
    name: "Straight Arm Lat Pulldown (Cable)",
    short: "Straight Arm Lat Pulldown",
    category: "back",
  },
  {
    slug: "tbar-row",
    name: "T-Bar Row",
    short: "T-Bar Row",
    category: "back",
  },
  {
    slug: "vertical-traction-machine",
    name: "Vertical Traction (Machine)",
    short: "Vertical Traction",
    category: "back",
  },
  {
    slug: "wide-pull-up",
    name: "Wide Pull Up",
    short: "Wide Pull Up",
    category: "back",
  },

  // Legs
  {
    slug: "assisted-pistol-squats",
    name: "Assisted Pistol Squats",
    short: "Assisted Pistol Squats",
    category: "legs",
  },
  {
    slug: "back-extension-hyperextension",
    name: "Back Extension (Hyperextension)",
    short: "Back Extension",
    category: "legs",
  },
  {
    slug: "back-extension-machine",
    name: "Back Extension (Machine)",
    short: "Back Extension",
    category: "legs",
  },
  {
    slug: "back-extension-weighted-hyperextension",
    name: "Back Extension (Weighted Hyperextension)",
    short: "Back Extension",
    category: "legs",
  },
  {
    slug: "belt-squat-machine",
    name: "Belt Squat (Machine)",
    short: "Belt Squat",
    category: "legs",
  },
  {
    slug: "box-squat-barbell",
    name: "Box Squat (Barbell)",
    short: "Box Squat",
    category: "legs",
  },
  {
    slug: "bulgarian-split-squat",
    name: "Bulgarian Split Squat (Dumbbell)",
    short: "Bulgarian Split Squat",
    category: "legs",
  },
  {
    slug: "cable-pull-through",
    name: "Cable Pull Through",
    short: "Cable Pull Through",
    category: "legs",
  },
  {
    slug: "calf-extension-machine",
    name: "Calf Extension (Machine)",
    short: "Calf Extension",
    category: "legs",
  },
  {
    slug: "calf-press-machine",
    name: "Calf Press (Machine)",
    short: "Calf Press",
    category: "legs",
  },
  {
    slug: "calf-raise",
    name: "Calf Raise",
    short: "Calf Raise",
    category: "legs",
  },
  {
    slug: "clean",
    name: "Clean",
    short: "Clean",
    category: "legs",
  },
  {
    slug: "clean-and-jerk",
    name: "Clean and Jerk",
    short: "Clean and Jerk",
    category: "legs",
  },
  {
    slug: "clean-and-press",
    name: "Clean and Press",
    short: "Clean and Press",
    category: "legs",
  },
  {
    slug: "curtsy-lunge-dumbbell",
    name: "Curtsy Lunge (Dumbbell)",
    short: "Curtsy Lunge",
    category: "legs",
  },
  {
    slug: "deadlift-band",
    name: "Deadlift (Band)",
    short: "Deadlift",
    category: "legs",
  },
  {
    slug: "deadlift-dumbbell",
    name: "Deadlift (Dumbbell)",
    short: "Deadlift",
    category: "legs",
  },
  {
    slug: "deadlift-smith-machine",
    name: "Deadlift (Smith Machine)",
    short: "Deadlift",
    category: "legs",
  },
  {
    slug: "deadlift-trap-bar",
    name: "Deadlift (Trap bar)",
    short: "Deadlift",
    category: "legs",
  },
  {
    slug: "deadlift-high-pull",
    name: "Deadlift High Pull",
    short: "Deadlift High Pull",
    category: "legs",
  },
  {
    slug: "dumbbell-step-up",
    name: "Dumbbell Step Up",
    short: "Dumbbell Step Up",
    category: "legs",
  },
  {
    slug: "frog-pumps-dumbbell",
    name: "Frog Pumps (Dumbbell)",
    short: "Frog Pumps",
    category: "legs",
  },
  {
    slug: "front-squat",
    name: "Front Squat (Barbell)",
    short: "Front Squat",
    category: "legs",
  },
  {
    slug: "full-squat",
    name: "Full Squat",
    short: "Full Squat",
    category: "legs",
  },
  {
    slug: "glute-bridge",
    name: "Glute Bridge",
    short: "Glute Bridge",
    category: "legs",
  },
  {
    slug: "glute-ham-raise",
    name: "Glute Ham Raise",
    short: "Glute Ham Raise",
    category: "legs",
  },
  {
    slug: "glute-kickback-machine",
    name: "Glute Kickback (Machine)",
    short: "Glute Kickback",
    category: "legs",
  },
  {
    slug: "glute-kickback-on-floor",
    name: "Glute Kickback on Floor",
    short: "Glute Kickback on Floor",
    category: "legs",
  },
  {
    slug: "goblet-squat",
    name: "Goblet Squat (Dumbbell)",
    short: "Goblet Squat",
    category: "legs",
  },
  {
    slug: "good-morning-barbell",
    name: "Good Morning (Barbell)",
    short: "Good Morning",
    category: "legs",
  },
  {
    slug: "hack-squat",
    name: "Hack Squat",
    short: "Hack Squat",
    category: "legs",
  },
  {
    slug: "hack-squat-machine",
    name: "Hack Squat (Machine)",
    short: "Hack Squat",
    category: "legs",
  },
  {
    slug: "hang-clean",
    name: "Hang Clean",
    short: "Hang Clean",
    category: "legs",
  },
  {
    slug: "hang-snatch",
    name: "Hang Snatch",
    short: "Hang Snatch",
    category: "legs",
  },
  {
    slug: "hip-abduction-machine",
    name: "Hip Abduction (Machine)",
    short: "Hip Abduction",
    category: "legs",
  },
  {
    slug: "hip-adduction-machine",
    name: "Hip Adduction (Machine)",
    short: "Hip Adduction",
    category: "legs",
  },
  {
    slug: "hip-thrust",
    name: "Hip Thrust (Barbell)",
    short: "Hip Thrust",
    category: "legs",
  },
  {
    slug: "hip-thrust-machine",
    name: "Hip Thrust (Machine)",
    short: "Hip Thrust",
    category: "legs",
  },
  {
    slug: "hip-thrust-smith-machine",
    name: "Hip Thrust (Smith Machine)",
    short: "Hip Thrust",
    category: "legs",
  },
  {
    slug: "kettlebell-clean",
    name: "Kettlebell Clean",
    short: "Kettlebell Clean",
    category: "legs",
  },
  {
    slug: "kettlebell-goblet-squat",
    name: "Kettlebell Goblet Squat",
    short: "Kettlebell Goblet Squat",
    category: "legs",
  },
  {
    slug: "kettlebell-snatch",
    name: "Kettlebell Snatch",
    short: "Kettlebell Snatch",
    category: "legs",
  },
  {
    slug: "landmine-squat-and-press",
    name: "Landmine Squat and Press",
    short: "Landmine Squat and Press",
    category: "legs",
  },
  {
    slug: "leg-curl",
    name: "Leg Curl (Machine)",
    short: "Leg Curl",
    category: "legs",
  },
  {
    slug: "leg-extension",
    name: "Leg Extension (Machine)",
    short: "Leg Extension",
    category: "legs",
  },
  {
    slug: "leg-press",
    name: "Leg Press (Machine)",
    short: "Leg Press",
    category: "legs",
  },
  {
    slug: "leg-press-horizontal-machine",
    name: "Leg Press Horizontal (Machine)",
    short: "Leg Press Horizontal",
    category: "legs",
  },
  {
    slug: "lunge-2",
    name: "Lunge",
    short: "Lunge",
    category: "legs",
  },
  {
    slug: "lunge-barbell",
    name: "Lunge (Barbell)",
    short: "Lunge",
    category: "legs",
  },
  {
    slug: "lunge",
    name: "Lunge (Dumbbell)",
    short: "Lunge",
    category: "legs",
  },
  {
    slug: "overhead-dumbbell-lunge",
    name: "Overhead Dumbbell Lunge",
    short: "Overhead Dumbbell Lunge",
    category: "legs",
  },
  {
    slug: "partial-glute-bridge-barbell",
    name: "Partial Glute Bridge (Barbell)",
    short: "Partial Glute Bridge",
    category: "legs",
  },
  {
    slug: "pause-squat-barbell",
    name: "Pause Squat (Barbell)",
    short: "Pause Squat",
    category: "legs",
  },
  {
    slug: "pendulum-squat-machine",
    name: "Pendulum Squat (Machine)",
    short: "Pendulum Squat",
    category: "legs",
  },
  {
    slug: "pistol-squat",
    name: "Pistol Squat",
    short: "Pistol Squat",
    category: "legs",
  },
  {
    slug: "power-clean",
    name: "Power Clean",
    short: "Power Clean",
    category: "legs",
  },
  {
    slug: "power-snatch",
    name: "Power Snatch",
    short: "Power Snatch",
    category: "legs",
  },
  {
    slug: "press-under",
    name: "Press Under",
    short: "Press Under",
    category: "legs",
  },
  {
    slug: "reverse-hyperextension",
    name: "Reverse Hyperextension",
    short: "Reverse Hyperextension",
    category: "legs",
  },
  {
    slug: "reverse-lunge",
    name: "Reverse Lunge",
    short: "Reverse Lunge",
    category: "legs",
  },
  {
    slug: "reverse-lunge-barbell",
    name: "Reverse Lunge (Barbell)",
    short: "Reverse Lunge",
    category: "legs",
  },
  {
    slug: "reverse-lunge-dumbbell",
    name: "Reverse Lunge (Dumbbell)",
    short: "Reverse Lunge",
    category: "legs",
  },
  {
    slug: "rdl",
    name: "Romanian Deadlift (Barbell)",
    short: "Romanian Deadlift",
    category: "legs",
  },
  {
    slug: "romanian-deadlift-dumbbell",
    name: "Romanian Deadlift (Dumbbell)",
    short: "Romanian Deadlift",
    category: "legs",
  },
  {
    slug: "seated-calf-raise",
    name: "Seated Calf Raise",
    short: "Seated Calf Raise",
    category: "legs",
  },
  {
    slug: "seated-leg-curl-machine",
    name: "Seated Leg Curl (Machine)",
    short: "Seated Leg Curl",
    category: "legs",
  },
  {
    slug: "single-leg-extensions",
    name: "Single Leg Extensions",
    short: "Single Leg Extensions",
    category: "legs",
  },
  {
    slug: "single-leg-glute-bridge",
    name: "Single Leg Glute Bridge",
    short: "Single Leg Glute Bridge",
    category: "legs",
  },
  {
    slug: "single-leg-hip-thrust",
    name: "Single Leg Hip Thrust",
    short: "Single Leg Hip Thrust",
    category: "legs",
  },
  {
    slug: "single-leg-hip-thrust-dumbbell",
    name: "Single Leg Hip Thrust (Dumbbell)",
    short: "Single Leg Hip Thrust",
    category: "legs",
  },
  {
    slug: "single-leg-press-machine",
    name: "Single Leg Press (Machine)",
    short: "Single Leg Press",
    category: "legs",
  },
  {
    slug: "single-leg-romanian-deadlift-barbell",
    name: "Single Leg Romanian Deadlift (Barbell)",
    short: "SL RDL",
    category: "legs",
  },
  {
    slug: "single-leg-romanian-deadlift-dumbbell",
    name: "Single Leg Romanian Deadlift (Dumbbell)",
    short: "SL RDL",
    category: "legs",
  },
  {
    slug: "single-leg-standing-calf-raise",
    name: "Single Leg Standing Calf Raise",
    short: "SL Calf Raise",
    category: "legs",
  },
  {
    slug: "single-leg-standing-calf-raise-barbell",
    name: "Single Leg Standing Calf Raise (Barbell)",
    short: "SL Calf Raise",
    category: "legs",
  },
  {
    slug: "single-leg-standing-calf-raise-dumbbell",
    name: "Single Leg Standing Calf Raise (Dumbbell)",
    short: "SL Calf Raise",
    category: "legs",
  },
  {
    slug: "single-leg-standing-calf-raise-machine",
    name: "Single Leg Standing Calf Raise (Machine)",
    short: "SL Calf Raise",
    category: "legs",
  },
  {
    slug: "sissy-squat-weighted",
    name: "Sissy Squat (Weighted)",
    short: "Sissy Squat",
    category: "legs",
  },
  {
    slug: "sled-push",
    name: "Sled Push",
    short: "Sled Push",
    category: "legs",
  },
  {
    slug: "snatch",
    name: "Snatch",
    short: "Snatch",
    category: "legs",
  },
  {
    slug: "split-jerk",
    name: "Split Jerk",
    short: "Split Jerk",
    category: "legs",
  },
  {
    slug: "split-squat-dumbbell",
    name: "Split Squat (Dumbbell)",
    short: "Split Squat",
    category: "legs",
  },
  {
    slug: "squat-band",
    name: "Squat (Band)",
    short: "Squat",
    category: "legs",
  },
  {
    slug: "squat",
    name: "Squat (Barbell)",
    short: "Squat",
    category: "legs",
  },
  {
    slug: "squat-dumbbell",
    name: "Squat (Dumbbell)",
    short: "Squat",
    category: "legs",
  },
  {
    slug: "squat-machine",
    name: "Squat (Machine)",
    short: "Squat",
    category: "legs",
  },
  {
    slug: "squat-smith-machine",
    name: "Squat (Smith Machine)",
    short: "Squat",
    category: "legs",
  },
  {
    slug: "squat-suspension",
    name: "Squat (Suspension)",
    short: "Squat",
    category: "legs",
  },
  {
    slug: "squat-row",
    name: "Squat Row",
    short: "Squat Row",
    category: "legs",
  },
  {
    slug: "standing-cable-glute-kickbacks",
    name: "Standing Cable Glute Kickbacks",
    short: "Standing Cable Glute Kickbacks",
    category: "legs",
  },
  {
    slug: "standing-calf-raise",
    name: "Standing Calf Raise",
    short: "Calf Raise",
    category: "legs",
  },
  {
    slug: "standing-calf-raise-barbell",
    name: "Standing Calf Raise (Barbell)",
    short: "Calf Raise",
    category: "legs",
  },
  {
    slug: "standing-calf-raise-dumbbell",
    name: "Standing Calf Raise (Dumbbell)",
    short: "Calf Raise",
    category: "legs",
  },
  {
    slug: "standing-calf-raise-machine",
    name: "Standing Calf Raise (Machine)",
    short: "Calf Raise",
    category: "legs",
  },
  {
    slug: "standing-calf-raise-smith",
    name: "Standing Calf Raise (Smith)",
    short: "Calf Raise",
    category: "legs",
  },
  {
    slug: "standing-leg-curls",
    name: "Standing Leg Curls",
    short: "Standing Leg Curls",
    category: "legs",
  },
  {
    slug: "step-up",
    name: "Step Up",
    short: "Step Up",
    category: "legs",
  },
  {
    slug: "straight-leg-deadlift",
    name: "Straight Leg Deadlift",
    short: "Straight Leg Deadlift",
    category: "legs",
  },
  {
    slug: "sumo-deadlift",
    name: "Sumo Deadlift",
    short: "Sumo Deadlift",
    category: "legs",
  },
  {
    slug: "sumo-squat",
    name: "Sumo Squat",
    short: "Sumo Squat",
    category: "legs",
  },
  {
    slug: "sumo-squat-barbell",
    name: "Sumo Squat (Barbell)",
    short: "Sumo Squat",
    category: "legs",
  },
  {
    slug: "sumo-squat-dumbbell",
    name: "Sumo Squat (Dumbbell)",
    short: "Sumo Squat",
    category: "legs",
  },
  {
    slug: "sumo-squat-kettlebell",
    name: "Sumo Squat (Kettlebell)",
    short: "Sumo Squat",
    category: "legs",
  },
  {
    slug: "zercher-squat",
    name: "Zercher Squat",
    short: "Zercher Squat",
    category: "legs",
  },

  // Shoulders
  {
    slug: "arnold-press",
    name: "Arnold Press (Dumbbell)",
    short: "Arnold Press",
    category: "shoulders",
  },
  {
    slug: "around-the-world",
    name: "Around The World",
    short: "Around The World",
    category: "shoulders",
  },
  {
    slug: "chest-supported-y-raise-dumbbell",
    name: "Chest Supported Y Raise (Dumbbell)",
    short: "Chest Supported Y Raise",
    category: "shoulders",
  },
  {
    slug: "front-raise",
    name: "Front Raise (Dumbbell)",
    short: "Front Raise",
    category: "shoulders",
  },
  {
    slug: "kettlebell-shoulder-press",
    name: "Kettlebell Shoulder Press",
    short: "Kettlebell Shoulder Press",
    category: "shoulders",
  },
  {
    slug: "lateral-raise",
    name: "Lateral Raise (Dumbbell)",
    short: "Lateral Raise",
    category: "shoulders",
  },
  {
    slug: "overhead-plate-raise",
    name: "Overhead Plate Raise",
    short: "Overhead Plate Raise",
    category: "shoulders",
  },
  {
    slug: "ohp",
    name: "Overhead Press (Barbell)",
    short: "Overhead Press",
    category: "shoulders",
  },
  {
    slug: "overhead-press-dumbbell",
    name: "Overhead Press (Dumbbell)",
    short: "Overhead Press",
    category: "shoulders",
  },
  {
    slug: "overhead-press-smith-machine",
    name: "Overhead Press (Smith Machine)",
    short: "Overhead Press",
    category: "shoulders",
  },
  {
    slug: "overhead-squat",
    name: "Overhead Squat",
    short: "Overhead Squat",
    category: "shoulders",
  },
  {
    slug: "push-press",
    name: "Push Press",
    short: "Push Press",
    category: "shoulders",
  },
  {
    slug: "rear-delt-fly",
    name: "Rear Delt Fly (Dumbbell)",
    short: "Rear Delt Fly",
    category: "shoulders",
  },
  {
    slug: "db-shoulder-press",
    name: "Shoulder Press (Dumbbell)",
    short: "Shoulder Press",
    category: "shoulders",
  },
  {
    slug: "shoulder-press-machine-plates",
    name: "Shoulder Press (Machine Plates)",
    short: "Shoulder Press",
    category: "shoulders",
  },
  {
    slug: "shrug-barbell",
    name: "Shrug (Barbell)",
    short: "Shrug",
    category: "shoulders",
  },
  {
    slug: "shrug-cable",
    name: "Shrug (Cable)",
    short: "Shrug",
    category: "shoulders",
  },
  {
    slug: "shrug",
    name: "Shrug (Dumbbell)",
    short: "Shrug",
    category: "shoulders",
  },
  {
    slug: "shrug-machine",
    name: "Shrug (Machine)",
    short: "Shrug",
    category: "shoulders",
  },
  {
    slug: "shrug-smith-machine",
    name: "Shrug (Smith Machine)",
    short: "Shrug",
    category: "shoulders",
  },
  {
    slug: "single-arm-landmine-press-barbell",
    name: "Single Arm Landmine Press (Barbell)",
    short: "Single Arm Landmine Press",
    category: "shoulders",
  },
  {
    slug: "standing-military-press-barbell",
    name: "Standing Military Press (Barbell)",
    short: "Standing Military Press",
    category: "shoulders",
  },
  {
    slug: "thruster-barbell",
    name: "Thruster (Barbell)",
    short: "Thruster",
    category: "shoulders",
  },
  {
    slug: "thruster-kettlebell",
    name: "Thruster (Kettlebell)",
    short: "Thruster",
    category: "shoulders",
  },
  {
    slug: "upright-row",
    name: "Upright Row (Barbell)",
    short: "Upright Row",
    category: "shoulders",
  },
  {
    slug: "upright-row-cable",
    name: "Upright Row (Cable)",
    short: "Upright Row",
    category: "shoulders",
  },
  {
    slug: "upright-row-dumbbell",
    name: "Upright Row (Dumbbell)",
    short: "Upright Row",
    category: "shoulders",
  },

  // Arms
  {
    slug: "21s-bicep-curl",
    name: "21s Bicep Curl",
    short: "21s Bicep Curl",
    category: "arms",
  },
  {
    slug: "behind-the-back-bicep-wrist-curl-barbell",
    name: "Behind the Back Bicep Wrist Curl (Barbell)",
    short: "Behind the Back Bicep Wrist Curl",
    category: "arms",
  },
  {
    slug: "behind-the-back-curl-cable",
    name: "Behind the Back Curl (Cable)",
    short: "Behind the Back Curl",
    category: "arms",
  },
  {
    slug: "bicep-curl-barbell",
    name: "Bicep Curl (Barbell)",
    short: "Bicep Curl",
    category: "arms",
  },
  {
    slug: "bicep-curl-cable",
    name: "Bicep Curl (Cable)",
    short: "Bicep Curl",
    category: "arms",
  },
  {
    slug: "bicep-curl",
    name: "Bicep Curl (Dumbbell)",
    short: "Bicep Curl",
    category: "arms",
  },
  {
    slug: "bicep-curl-machine",
    name: "Bicep Curl (Machine)",
    short: "Bicep Curl",
    category: "arms",
  },
  {
    slug: "bicep-curl-suspension",
    name: "Bicep Curl (Suspension)",
    short: "Bicep Curl",
    category: "arms",
  },
  {
    slug: "close-grip-bench",
    name: "Close-Grip Bench Press (Barbell)",
    short: "Close-Grip Bench Press",
    category: "arms",
  },
  {
    slug: "concentration-curl",
    name: "Concentration Curl",
    short: "Concentration Curl",
    category: "arms",
  },
  {
    slug: "cross-body-hammer-curl",
    name: "Cross Body Hammer Curl",
    short: "Cross Body Hammer Curl",
    category: "arms",
  },
  {
    slug: "barbell-curl",
    name: "Curl (Barbell)",
    short: "Curl",
    category: "arms",
  },
  {
    slug: "drag-curl",
    name: "Drag Curl",
    short: "Drag Curl",
    category: "arms",
  },
  {
    slug: "ez-bar-biceps-curl",
    name: "EZ Bar Biceps Curl",
    short: "EZ Bar Biceps Curl",
    category: "arms",
  },
  {
    slug: "hammer-curl-band",
    name: "Hammer Curl (Band)",
    short: "Hammer Curl",
    category: "arms",
  },
  {
    slug: "hammer-curl-cable",
    name: "Hammer Curl (Cable)",
    short: "Hammer Curl",
    category: "arms",
  },
  {
    slug: "hammer-curl",
    name: "Hammer Curl (Dumbbell)",
    short: "Hammer Curl",
    category: "arms",
  },
  {
    slug: "jm-press-barbell",
    name: "JM Press (Barbell)",
    short: "JM Press",
    category: "arms",
  },
  {
    slug: "kettlebell-curl",
    name: "Kettlebell Curl",
    short: "Kettlebell Curl",
    category: "arms",
  },
  {
    slug: "overhead-curl-cable",
    name: "Overhead Curl (Cable)",
    short: "Overhead Curl",
    category: "arms",
  },
  {
    slug: "overhead-tricep-ext",
    name: "Overhead Extension (Dumbbell)",
    short: "Overhead Extension",
    category: "arms",
  },
  {
    slug: "pinwheel-curl-dumbbell",
    name: "Pinwheel Curl (Dumbbell)",
    short: "Pinwheel Curl",
    category: "arms",
  },
  {
    slug: "plate-curl",
    name: "Plate Curl",
    short: "Plate Curl",
    category: "arms",
  },
  {
    slug: "preacher-curl",
    name: "Preacher Curl",
    short: "Preacher Curl",
    category: "arms",
  },
  {
    slug: "preacher-curl-barbell",
    name: "Preacher Curl (Barbell)",
    short: "Preacher Curl",
    category: "arms",
  },
  {
    slug: "preacher-curl-dumbbell",
    name: "Preacher Curl (Dumbbell)",
    short: "Preacher Curl",
    category: "arms",
  },
  {
    slug: "preacher-curl-machine",
    name: "Preacher Curl (Machine)",
    short: "Preacher Curl",
    category: "arms",
  },
  {
    slug: "reverse-curl-barbell",
    name: "Reverse Curl (Barbell)",
    short: "Reverse Curl",
    category: "arms",
  },
  {
    slug: "reverse-curl-cable",
    name: "Reverse Curl (Cable)",
    short: "Reverse Curl",
    category: "arms",
  },
  {
    slug: "reverse-curl-dumbbell",
    name: "Reverse Curl (Dumbbell)",
    short: "Reverse Curl",
    category: "arms",
  },
  {
    slug: "reverse-grip-concentration-curl",
    name: "Reverse Grip Concentration Curl",
    short: "Reverse Grip Concentration Curl",
    category: "arms",
  },
  {
    slug: "rope-cable-curl",
    name: "Rope Cable Curl",
    short: "Rope Cable Curl",
    category: "arms",
  },
  {
    slug: "seated-incline-curl-dumbbell",
    name: "Seated Incline Curl (Dumbbell)",
    short: "Seated Incline Curl",
    category: "arms",
  },
  {
    slug: "seated-palms-up-wrist-curl",
    name: "Seated Palms Up Wrist Curl",
    short: "Seated Palms Up Wrist Curl",
    category: "arms",
  },
  {
    slug: "seated-triceps-press",
    name: "Seated Triceps Press",
    short: "Seated Triceps Press",
    category: "arms",
  },
  {
    slug: "seated-wrist-extension-barbell",
    name: "Seated Wrist Extension (Barbell)",
    short: "Seated Wrist Extension",
    category: "arms",
  },
  {
    slug: "single-arm-curl-cable",
    name: "Single Arm Curl (Cable)",
    short: "Single Arm Curl",
    category: "arms",
  },
  {
    slug: "single-arm-tricep-extension-dumbbell",
    name: "Single Arm Tricep Extension (Dumbbell)",
    short: "Single Arm Tricep Extension",
    category: "arms",
  },
  {
    slug: "single-arm-triceps-pushdown-cable",
    name: "Single Arm Triceps Pushdown (Cable)",
    short: "Single Arm Triceps Pushdown",
    category: "arms",
  },
  {
    slug: "skullcrusher",
    name: "Skullcrusher (Barbell)",
    short: "Skullcrusher",
    category: "arms",
  },
  {
    slug: "skullcrusher-dumbbell",
    name: "Skullcrusher (Dumbbell)",
    short: "Skullcrusher",
    category: "arms",
  },
  {
    slug: "spider-curl-barbell",
    name: "Spider Curl (Barbell)",
    short: "Spider Curl",
    category: "arms",
  },
  {
    slug: "spider-curl-dumbbell",
    name: "Spider Curl (Dumbbell)",
    short: "Spider Curl",
    category: "arms",
  },
  {
    slug: "tricep-pushdown",
    name: "Tricep Pushdown (Cable)",
    short: "Tricep Pushdown",
    category: "arms",
  },
  {
    slug: "triceps-extension-barbell",
    name: "Triceps Extension (Barbell)",
    short: "Triceps Extension",
    category: "arms",
  },
  {
    slug: "triceps-extension-cable",
    name: "Triceps Extension (Cable)",
    short: "Triceps Extension",
    category: "arms",
  },
  {
    slug: "triceps-extension-machine",
    name: "Triceps Extension (Machine)",
    short: "Triceps Extension",
    category: "arms",
  },
  {
    slug: "triceps-extension-suspension",
    name: "Triceps Extension (Suspension)",
    short: "Triceps Extension",
    category: "arms",
  },
  {
    slug: "triceps-kickback-cable",
    name: "Triceps Kickback (Cable)",
    short: "Triceps Kickback",
    category: "arms",
  },
  {
    slug: "triceps-kickback-dumbbell",
    name: "Triceps Kickback (Dumbbell)",
    short: "Triceps Kickback",
    category: "arms",
  },
  {
    slug: "triceps-pressdown",
    name: "Triceps Pressdown",
    short: "Triceps Pressdown",
    category: "arms",
  },
  {
    slug: "triceps-rope-pushdown",
    name: "Triceps Rope Pushdown",
    short: "Triceps Rope Pushdown",
    category: "arms",
  },
  {
    slug: "waiter-curl-dumbbell",
    name: "Waiter Curl (Dumbbell)",
    short: "Waiter Curl",
    category: "arms",
  },
  {
    slug: "wrist-roller",
    name: "Wrist Roller",
    short: "Wrist Roller",
    category: "arms",
  },

  // Core
  {
    slug: "ab-wheel",
    name: "Ab Wheel Rollout",
    short: "Ab Wheel Rollout",
    category: "core",
  },
  {
    slug: "cable-crunch",
    name: "Cable Crunch",
    short: "Cable Crunch",
    category: "core",
  },
  {
    slug: "hanging-leg-raise",
    name: "Hanging Leg Raise",
    short: "Hanging Leg Raise",
    category: "core",
  },
  {
    slug: "kettlebell-around-the-world",
    name: "Kettlebell Around the World",
    short: "Kettlebell Around the World",
    category: "core",
  },
  {
    slug: "kettlebell-halo",
    name: "Kettlebell Halo",
    short: "Kettlebell Halo",
    category: "core",
  },
  {
    slug: "kettlebell-swing",
    name: "Kettlebell Swing",
    short: "Kettlebell Swing",
    category: "core",
  },
  {
    slug: "kettlebell-turkish-get-up",
    name: "Kettlebell Turkish Get Up",
    short: "Kettlebell Turkish Get Up",
    category: "core",
  },
  {
    slug: "plank",
    name: "Plank",
    short: "Plank",
    category: "core",
  },
  {
    slug: "russian-twist",
    name: "Russian Twist",
    short: "Russian Twist",
    category: "core",
  },
  {
    slug: "situp",
    name: "Sit-up",
    short: "Sit-up",
    category: "core",
  },
];

/** True for barbell (and similar) lifts where plate math includes the bar. */
function resolveUsesBar(e: Exercise | undefined): boolean {
  if (!e) return true;
  if (typeof e.usesBar === "boolean") return e.usesBar;
  return !e.name.includes("(Dumbbell)");
}

export type ExerciseCatalog = {
  /** Curated lifts plus the user's non-archived custom lifts. */
  all: Exercise[];
  name: (slug: string) => string;
  short: (slug: string) => string;
  usesBar: (slug: string) => boolean;
  search: (query: string, group: MuscleGroup | "all") => Exercise[];
};

/**
 * Build a lookup over the curated catalog merged with a user's custom lifts.
 * Archived customs are still resolvable by name/short/usesBar (so old history
 * renders), but are excluded from `all` and `search` (pickers).
 */
export function buildCatalog(
  customs: readonly CustomExerciseEntry[] = [],
): ExerciseCatalog {
  const customExercises: Exercise[] = customs.map((c) => ({
    slug: c.slug,
    name: c.name,
    short: c.short?.trim() || c.name,
    category: c.category,
    usesBar: c.usesBar,
    archived: c.archived,
    custom: true,
  }));

  const bySlug = new Map<string, Exercise>(
    [...EXERCISES, ...customExercises].map((e) => [e.slug, e]),
  );
  const all = [...EXERCISES, ...customExercises.filter((e) => !e.archived)];

  return {
    all,
    name: (slug) => bySlug.get(slug)?.name ?? slug,
    short: (slug) => bySlug.get(slug)?.short ?? slug,
    usesBar: (slug) => resolveUsesBar(bySlug.get(slug)),
    search: (query, group) => {
      const q = query.trim().toLowerCase();
      return all.filter((e) => {
        if (group !== "all" && e.category !== group) return false;
        if (!q) return true;
        return e.name.toLowerCase().includes(q);
      });
    },
  };
}

/** Catalog over the curated lifts only — for non-React contexts (e.g. MCP). */
const staticCatalog = buildCatalog();

export const exerciseName = staticCatalog.name;
export const exerciseShort = staticCatalog.short;
export const exerciseUsesBar = staticCatalog.usesBar;
export const searchExercises = staticCatalog.search;
