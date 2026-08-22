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

export function formatHealthHistoryLine(input: {
  sessionKind?: string | null;
  sourceName?: string | null;
  distanceMeters?: number | null;
  energyKcal?: number | null;
  unit?: "lb" | "kg";
}) {
  if (input.sessionKind !== "health_summary") return null;
  return [
    input.sourceName ? `Health · ${input.sourceName}` : "Apple Health",
    formatHealthDistance(input.distanceMeters, input.unit ?? "lb"),
    formatHealthEnergy(input.energyKcal),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
