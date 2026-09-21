export function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value));
}

export function goalPercent(current?: number | null, target?: number | null) {
  if (!target || target <= 0 || current == null) {
    return 0;
  }

  return Math.min(100, Math.round((current / target) * 100));
}

export function initials(name?: string | null) {
  if (!name) {
    return "MF";
  }

  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
