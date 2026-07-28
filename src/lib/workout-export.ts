import type { Infer } from "convex/values";

import type { ExerciseCatalog, MuscleGroup } from "./exercises";
// Type-only: erased at build time, so neither the Next.js bundle nor Metro
// ever resolves a path into `backend/`. Keeping the type derived from the
// Convex validator means the wire format cannot drift from what the server
// accepts.
import type { portableBundleValidator } from "../../backend/schemas/portable";

export type WorkoutExportBundle = Infer<typeof portableBundleValidator>;
export type WorkoutExportTemplate = WorkoutExportBundle["templates"][number];

export const EXPORT_FORMAT = "workout.export";
export const EXPORT_VERSION = 1;

/** Prefix on pasted codes — lets us recognise one and give a real error. */
export const CODE_PREFIX = "WKT1-";

/** Shape returned by `api.routes.templates.queries.exportData`. */
export type TemplateExportData = {
  unit: "lb" | "kg";
  templates: {
    name: string;
    exercises: {
      slug: string;
      sets: { weight: number; reps: number }[];
      notes?: string;
    }[];
  }[];
  customExercises: {
    slug: string;
    name: string;
    short?: string;
    category: MuscleGroup;
    usesBar: boolean;
  }[];
};

/**
 * Finish a server-side export by attaching display names from the catalog.
 *
 * Names travel with every exercise so the recipient can read (and if needed
 * recreate) a lift whose slug means nothing to them — a `custom:` slug from
 * someone else's account, or a curated slug their client predates.
 */
export function toBundle(
  data: TemplateExportData,
  catalog: ExerciseCatalog,
  options: { exportedAt?: number } = {},
): WorkoutExportBundle {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: options.exportedAt ?? Date.now(),
    unit: data.unit,
    templates: data.templates.map((template) => ({
      name: template.name,
      exercises: template.exercises.map((exercise) => ({
        slug: exercise.slug,
        name: catalog.name(exercise.slug),
        // Copied, not aliased: the bundle is handed to callers that serialize
        // and sometimes edit it, and it must not write back into query data.
        sets: exercise.sets.map((set) => ({ ...set })),
        ...(exercise.notes ? { notes: exercise.notes } : {}),
      })),
    })),
    customExercises: data.customExercises.map((entry) => ({ ...entry })),
  };
}

/** Pretty JSON — this is what lands in the `.json` file a human may open. */
export function serializeBundle(bundle: WorkoutExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function bundleFileName(bundle: WorkoutExportBundle): string {
  const date = new Date(bundle.exportedAt).toISOString().slice(0, 10);
  const only =
    bundle.templates.length === 1 ? bundle.templates[0]?.name : undefined;
  const label = only
    ? only
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "workout"
    : "workouts";
  return `${label}-${date}.json`;
}

// Base64 is implemented here rather than via btoa/atob, Buffer, or TextEncoder
// because this module runs in four places — the browser, a service worker,
// Node (tests), and Hermes — and none of those globals is guaranteed in all
// four. A missing global would fail at import time on device, so the encoding
// depends on nothing but String and Array.
const B64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** UTF-8 bytes of a string, via percent-encoding (available in every runtime). */
function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  const encoded = encodeURIComponent(text);
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === "%") {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }
  return bytes;
}

function utf8String(bytes: number[]): string {
  let percent = "";
  for (const byte of bytes) {
    percent += `%${byte.toString(16).padStart(2, "0")}`;
  }
  return decodeURIComponent(percent);
}

/** Unpadded base64url — safe in a URL, a query string, and a chat message. */
function base64UrlEncode(text: string): string {
  const bytes = utf8Bytes(text);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);

    out += B64_ALPHABET[(triple >> 18) & 63];
    out += B64_ALPHABET[(triple >> 12) & 63];
    if (b !== undefined) out += B64_ALPHABET[(triple >> 6) & 63];
    if (c !== undefined) out += B64_ALPHABET[triple & 63];
  }
  return out;
}

function base64UrlDecode(encoded: string): string {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of encoded) {
    const value = B64_ALPHABET.indexOf(char);
    if (value < 0) throw new Error("Invalid base64url input");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return utf8String(bytes);
}

/**
 * A self-contained code that carries the whole bundle — no server, no network.
 * This is the transport that works offline and survives any chat app.
 */
export function encodeBundleCode(bundle: WorkoutExportBundle): string {
  return CODE_PREFIX + base64UrlEncode(JSON.stringify(bundle));
}

export type ParseResult =
  | { ok: true; bundle: WorkoutExportBundle }
  | { ok: false; error: string };

const MAX_INPUT_LENGTH = 512_000;

/**
 * Parse untrusted text into a bundle. Accepts either a pasted code or raw
 * `.json` file contents, so a user can paste whichever they were sent without
 * having to know the difference.
 *
 * The server re-validates everything; this exists to fail fast with a message
 * a human can act on.
 */
export function parseBundle(input: string): ParseResult {
  const text = input.trim();
  if (!text)
    return { ok: false, error: "Paste an export code or choose a file" };
  if (text.length > MAX_INPUT_LENGTH)
    return { ok: false, error: "That export is too large to import" };

  let json = text;
  if (text.startsWith(CODE_PREFIX)) {
    try {
      json = base64UrlDecode(text.slice(CODE_PREFIX.length));
    } catch {
      return {
        ok: false,
        error:
          "That code looks incomplete — copy the whole thing and try again",
      };
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      ok: false,
      error:
        "That doesn't look like a workout export — expected a code or a .json file",
    };
  }

  return validateBundle(parsed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MUSCLE_GROUPS: MuscleGroup[] = [
  "chest",
  "back",
  "legs",
  "shoulders",
  "arms",
  "core",
];

/**
 * Structural check mirroring `portableBundleValidator`. Anything the server
 * would reject is rejected here too, so bad input never round-trips.
 */
export function validateBundle(value: unknown): ParseResult {
  if (!isRecord(value)) return { ok: false, error: "Export is not an object" };
  if (value.format !== EXPORT_FORMAT)
    return { ok: false, error: "That file isn't a workout export" };
  if (value.version !== EXPORT_VERSION) {
    return {
      ok: false,
      error:
        typeof value.version === "number" && value.version > EXPORT_VERSION
          ? "This export was made by a newer version of the app — update and try again"
          : "This export uses an unsupported format version",
    };
  }
  if (value.unit !== "lb" && value.unit !== "kg")
    return { ok: false, error: "Export is missing a weight unit" };
  if (!Array.isArray(value.templates) || value.templates.length === 0)
    return { ok: false, error: "This export contains no templates" };

  const templates: WorkoutExportTemplate[] = [];
  for (const raw of value.templates) {
    if (!isRecord(raw) || typeof raw.name !== "string")
      return { ok: false, error: "A template is missing its name" };
    if (!Array.isArray(raw.exercises))
      return { ok: false, error: `"${raw.name}" is missing its exercises` };

    const exercises: WorkoutExportTemplate["exercises"] = [];
    for (const rawExercise of raw.exercises) {
      if (
        !isRecord(rawExercise) ||
        typeof rawExercise.slug !== "string" ||
        !Array.isArray(rawExercise.sets)
      ) {
        return { ok: false, error: `"${raw.name}" has a malformed exercise` };
      }
      const sets: { weight: number; reps: number }[] = [];
      for (const rawSet of rawExercise.sets) {
        if (
          !isRecord(rawSet) ||
          !Number.isFinite(rawSet.weight) ||
          !Number.isFinite(rawSet.reps)
        ) {
          return { ok: false, error: `"${raw.name}" has a malformed set` };
        }
        sets.push({
          weight: Number(rawSet.weight),
          reps: Number(rawSet.reps),
        });
      }
      exercises.push({
        slug: rawExercise.slug,
        name:
          typeof rawExercise.name === "string" && rawExercise.name.trim()
            ? rawExercise.name
            : rawExercise.slug,
        sets,
        ...(typeof rawExercise.notes === "string" && rawExercise.notes.trim()
          ? { notes: rawExercise.notes }
          : {}),
      });
    }
    templates.push({ name: raw.name, exercises });
  }

  const customExercises: WorkoutExportBundle["customExercises"] = [];
  if (value.customExercises !== undefined) {
    if (!Array.isArray(value.customExercises))
      return { ok: false, error: "Export has malformed custom exercises" };
    for (const raw of value.customExercises) {
      if (
        !isRecord(raw) ||
        typeof raw.slug !== "string" ||
        typeof raw.name !== "string" ||
        typeof raw.usesBar !== "boolean" ||
        !MUSCLE_GROUPS.includes(raw.category as MuscleGroup)
      ) {
        return { ok: false, error: "Export has a malformed custom exercise" };
      }
      customExercises.push({
        slug: raw.slug,
        name: raw.name,
        category: raw.category as MuscleGroup,
        usesBar: raw.usesBar,
        ...(typeof raw.short === "string" && raw.short.trim()
          ? { short: raw.short }
          : {}),
      });
    }
  }

  return {
    ok: true,
    bundle: {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: Number.isFinite(value.exportedAt)
        ? Number(value.exportedAt)
        : Date.now(),
      unit: value.unit,
      templates,
      customExercises,
    },
  };
}

export type BundleSummary = {
  templateCount: number;
  exerciseCount: number;
  setCount: number;
  customCount: number;
  unit: "lb" | "kg";
};

export function summarizeBundle(bundle: WorkoutExportBundle): BundleSummary {
  let exerciseCount = 0;
  let setCount = 0;
  for (const template of bundle.templates) {
    exerciseCount += template.exercises.length;
    for (const exercise of template.exercises) setCount += exercise.sets.length;
  }
  return {
    templateCount: bundle.templates.length,
    exerciseCount,
    setCount,
    customCount: bundle.customExercises.length,
    unit: bundle.unit,
  };
}

export function sharePath(token: string): string {
  return `/share/${token}`;
}

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${sharePath(token)}`;
}

/** Human blurb under the preview, e.g. "3 templates · 14 exercises · 52 sets". */
export function describeBundle(bundle: WorkoutExportBundle): string {
  const { templateCount, exerciseCount, setCount } = summarizeBundle(bundle);
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  return [
    plural(templateCount, "template"),
    plural(exerciseCount, "exercise"),
    plural(setCount, "set"),
  ].join(" · ");
}
