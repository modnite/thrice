export { formatMoney } from "@thrice/shared/currency";

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDuration(from: Date, to: Date): string {
  const totalMinutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24 && minutes === 0 && hours % 24 === 0) {
    const days = hours / 24;
    // "(24h)" is TWICE's day type (24-hour days), not the total hours.
    return `${days} day${days === 1 ? "" : "s"} (24h)`;
  }
  if (hours === 0) return `${minutes} min`;
  const h = `${hours} hour${hours === 1 ? "" : "s"}`;
  return minutes === 0 ? h : `${h} ${minutes} min`;
}

export function formatDateTime(date: Date | string | null | undefined, timeZone?: string): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

const TIME_OPTS = { hour: "numeric", minute: "2-digit" } as const;

/** "Sat 19.9., 12:00 PM" — the compact stamp on a TWICE order card. */
export function formatCardStamp(date: Date, timeZone?: string): string {
  const weekday = date.toLocaleDateString("en-US", { weekday: "short", timeZone });
  const day = Number(date.toLocaleDateString("en-US", { day: "numeric", timeZone }));
  const month = Number(date.toLocaleDateString("en-US", { month: "numeric", timeZone }));
  return `${weekday} ${day}.${month}., ${date.toLocaleTimeString("en-US", { ...TIME_OPTS, timeZone })}`;
}

/** "Sep 19, 12:00 PM" — the per-item stamp. */
export function formatItemStamp(date: Date, timeZone?: string): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", ...TIME_OPTS, timeZone });
}
