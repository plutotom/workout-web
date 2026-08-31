export const MAX_HEALTH_SEGMENTS = 20;

export type HealthWorkoutSegment = {
  activityType: string;
  activityName: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  distanceMeters: number | null;
  energyKcal: number | null;
};

const TRIATHLON_SPORTS = ["swimming", "cycling", "running"] as const;

export function formatHealthDistance(
  meters: number | null | undefined,
  unit: "lb" | "kg" = "lb",
) {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
  if (unit === "kg") {
    const km = meters / 1000;
    return `${km >= 10 ? km.toFixed(1) : km.toFixed(2)} km`;
  }
  const miles = meters / 1609.344;
  return `${miles >= 10 ? miles.toFixed(1) : miles.toFixed(2)} mi`;
}

export function formatHealthEnergy(kcal: number | null | undefined) {
  if (kcal == null || !Number.isFinite(kcal) || kcal <= 0) return null;
  return `${Math.round(kcal)} kcal`;
}

/** Clock for a triathlon split: `28:12` or `1:05:33`. */
export function formatHealthSplitClock(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function healthSportSegments(
  segments: HealthWorkoutSegment[] | null | undefined,
) {
  return (segments ?? []).filter(
    (segment) =>
      segment.activityType !== "transition" &&
      segment.activityType !== "other" &&
      segment.activityName !== "Split",
  );
}

/** Compact `Swim · Bike · Run` line, skipping transitions. */
export function formatHealthSportLine(
  segments: HealthWorkoutSegment[] | null | undefined,
) {
  const names = healthSportSegments(segments).map(
    (segment) => segment.activityName,
  );
  return names.length > 0 ? names.join(" · ") : null;
}

export function multiSportDisplayName(
  activityType: string,
  segments: HealthWorkoutSegment[] | null | undefined,
) {
  if (activityType !== "swimBikeRun") return null;
  const sports = healthSportSegments(segments).map(
    (segment) => segment.activityType,
  );
  if (sports.length === 0) return "Triathlon";
  const unique = new Set(sports);
  const isTriathlon =
    TRIATHLON_SPORTS.every((sport) => unique.has(sport)) && unique.size === 3;
  if (isTriathlon) return "Triathlon";
  const runCount = sports.filter((sport) => sport === "running").length;
  if (runCount >= 2 && unique.has("cycling") && unique.size <= 2) {
    return "Duathlon";
  }
  return "Multisport";
}

export function formatHealthHistoryLine(input: {
  sessionKind?: string | null;
  sourceName?: string | null;
  distanceMeters?: number | null;
  energyKcal?: number | null;
  unit?: "lb" | "kg";
  healthSegments?: HealthWorkoutSegment[] | null;
}) {
  if (input.sessionKind !== "health_summary") return null;
  return [
    input.sourceName ? `Health · ${input.sourceName}` : "Apple Health",
    formatHealthSportLine(input.healthSegments),
    formatHealthDistance(input.distanceMeters, input.unit ?? "lb"),
    formatHealthEnergy(input.energyKcal),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function formatHealthSegmentRows(
  segments: HealthWorkoutSegment[] | null | undefined,
  unit: "lb" | "kg" = "lb",
) {
  return (segments ?? []).map((segment, index) => {
    const facts = [
      formatHealthSplitClock(segment.durationSeconds),
      formatHealthDistance(segment.distanceMeters, unit),
      formatHealthEnergy(segment.energyKcal),
    ].filter((part): part is string => Boolean(part));
    return {
      key: `${segment.activityType}-${segment.startedAt}-${index}`,
      name:
        segment.activityName === "Split"
          ? `Split ${index + 1}`
          : segment.activityName,
      facts: facts.join(" · "),
      isTransition: segment.activityType === "transition",
    };
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalPositiveNumber(value: unknown): number | null {
  return isFiniteNumber(value) && value > 0 ? value : null;
}

export function parseHealthSegment(
  value: unknown,
): HealthWorkoutSegment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.activityType !== "string" || !raw.activityType.trim()) {
    return null;
  }
  if (typeof raw.activityName !== "string" || !raw.activityName.trim()) {
    return null;
  }
  if (!isFiniteNumber(raw.startedAt) || !isFiniteNumber(raw.endedAt)) {
    return null;
  }
  if (raw.endedAt < raw.startedAt) return null;
  const durationSeconds = isFiniteNumber(raw.durationSeconds)
    ? Math.max(0, raw.durationSeconds)
    : Math.max(0, (raw.endedAt - raw.startedAt) / 1000);
  return {
    activityType: raw.activityType.trim(),
    activityName: raw.activityName.trim(),
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    durationSeconds,
    distanceMeters: optionalPositiveNumber(raw.distanceMeters),
    energyKcal: optionalPositiveNumber(raw.energyKcal),
  };
}

export function parseHealthSegments(value: unknown): HealthWorkoutSegment[] {
  if (!Array.isArray(value)) return [];
  const segments: HealthWorkoutSegment[] = [];
  for (const item of value) {
    if (segments.length >= MAX_HEALTH_SEGMENTS) break;
    const parsed = parseHealthSegment(item);
    if (parsed) segments.push(parsed);
  }
  return segments;
}

export function parseHealthSegmentsJson(
  raw: string | null | undefined,
): HealthWorkoutSegment[] {
  if (!raw || !raw.trim()) return [];
  try {
    return parseHealthSegments(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function serializeHealthSegments(
  segments: HealthWorkoutSegment[] | null | undefined,
): string | null {
  const parsed = parseHealthSegments(segments ?? []);
  return parsed.length > 0 ? JSON.stringify(parsed) : null;
}
