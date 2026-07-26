export function formatDuration(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatWeight(value: number, unit = "lb") {
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

export function formatDate(
  timestamp: number,
  style: "short" | "long" = "long",
) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: style === "long" ? "long" : undefined,
    month: style === "long" ? "long" : "short",
    day: "numeric",
  });
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
