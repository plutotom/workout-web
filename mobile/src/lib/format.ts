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

/**
 * Coarse on purpose. A status line wants "3 weeks ago" — the point is whether
 * it's recent, and an exact date makes the reader do the arithmetic.
 */
export function formatRelativeDay(timestamp: number, now = Date.now()) {
  const days = Math.floor((now - timestamp) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return "over a year ago";
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
