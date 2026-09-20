/** Midnight (start of the given YYYY-MM-DD day) in an IANA timezone, as a UTC instant. */
export function zonedDayStart(dateStr: string, timeZone: string): Date {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(guess.getTime())) return guess;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

/** Today's date (YYYY-MM-DD) as the given timezone sees it. */
export function zonedToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The [start, end) instants of the current calendar day in a timezone. */
export function zonedDayBounds(timeZone: string, now: Date = new Date()): { start: Date; end: Date } {
  const start = zonedDayStart(zonedToday(timeZone, now), timeZone);
  return { start, end: new Date(start.getTime() + 24 * 3600_000) };
}
