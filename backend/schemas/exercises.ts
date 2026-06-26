import { v } from "convex/values";

// Informational — the authoritative curated catalog lives client-side in
// src/lib/exercises.ts. Slugs are open strings to support future custom lifts.
export const EXERCISE_SLUGS = ["bench", "squat", "deadlift"] as const;

export const exerciseSlugValidator = v.string();
