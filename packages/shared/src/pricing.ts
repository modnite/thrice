// Rate-based rental pricing, following TWICE's documented "How price tables work".
//
// A variant has rate rows: "1 hour = X", "1 day = Y", "1 week = Z". Each row has a base price and
// an optional additional price. A booking is priced by taking the longest row that still fits,
// then filling what is left with shorter rows, repeatedly. The first block is charged at that
// row's base price and every later block at its additional price (falling back to the base price).
// A remainder shorter than every row is charged as one block of the shortest row.
//
// Example (TWICE's own): 9 days against 1 day, 3 days and 1 week rows is one week plus two days,
// not nine single days.
//
// Two ways of measuring the booking:
//  - ELAPSED (default): a day is 24 hours from pickup. A 36 hour rental is 1.5 days.
//  - CALENDAR_DAYS ("Starting at"): every calendar day the booking touches is charged, so a
//    23:00 pickup and 01:00 return counts as two days. Rows must then be whole days.
//
// A variant with only a flat row (no duration) costs that price whatever the duration.

import { zonedToday } from "./zoned-date.js";

export type RateRow = {
  /** Length of this block in minutes; null = flat price regardless of duration. */
  durationMinutes: number | null;
  price: number;
  /** Price for every block after the first; falls back to `price`. */
  additionalPrice?: number | null;
};

export type PricingMode = "ELAPSED" | "CALENDAR_DAYS";

export type PriceBlock = { durationMinutes: number | null; price: number; kind: "base" | "additional" | "flat" };

export type PriceQuote = { total: number; blocks: PriceBlock[]; mode: PricingMode; calendarDays?: number };

const DAY = 1440;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rows that can price calendar days: whole days only. */
export function wholeDayRows(rows: RateRow[]): RateRow[] {
  return rows.filter((r) => r.durationMinutes !== null && r.durationMinutes >= DAY && r.durationMinutes % DAY === 0);
}

/** How many calendar days (in the store's timezone) a booking touches; the return instant itself does not count. */
export function calendarDaysTouched(from: Date, to: Date, timeZone: string): number {
  const first = Date.parse(`${zonedToday(timeZone, from)}T00:00:00Z`);
  const last = Date.parse(`${zonedToday(timeZone, new Date(Math.max(to.getTime() - 1, from.getTime())))}T00:00:00Z`);
  return Math.max(1, Math.round((last - first) / (DAY * 60_000)) + 1);
}

/** Prices a duration in minutes against rate rows using the longest-fit rule. */
export function quotePrice(rows: RateRow[], durationMinutes: number): PriceQuote | null {
  if (rows.length === 0) return null;

  const timed = rows
    .filter((r): r is RateRow & { durationMinutes: number } => r.durationMinutes !== null && r.durationMinutes > 0)
    .sort((a, b) => b.durationMinutes - a.durationMinutes); // longest first

  if (timed.length === 0) {
    const flat = rows.find((r) => r.durationMinutes === null) ?? rows[0];
    return { total: round2(flat.price), blocks: [{ durationMinutes: null, price: flat.price, kind: "flat" }], mode: "ELAPSED" };
  }

  const shortest = timed[timed.length - 1];
  const blocks: PriceBlock[] = [];
  let total = 0;
  let remaining = Math.max(1, Math.round(durationMinutes));

  while (remaining > 0) {
    const row = timed.find((r) => r.durationMinutes <= remaining) ?? shortest;
    const first = blocks.length === 0;
    const price = first ? row.price : (row.additionalPrice ?? row.price);
    blocks.push({ durationMinutes: row.durationMinutes, price, kind: first ? "base" : "additional" });
    total += price;
    remaining -= row.durationMinutes;
  }
  return { total: round2(total), blocks, mode: "ELAPSED" };
}

/**
 * Prices a real booking window. In CALENDAR_DAYS mode the duration becomes the number of calendar
 * days touched; if the variant has no whole-day rows it falls back to elapsed pricing.
 */
export function quoteBooking(
  rows: RateRow[],
  from: Date,
  to: Date,
  options: { mode?: PricingMode; timeZone?: string } = {}
): PriceQuote | null {
  const elapsedMinutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  if (options.mode === "CALENDAR_DAYS" && options.timeZone) {
    const dayRows = wholeDayRows(rows);
    if (dayRows.length > 0) {
      const days = calendarDaysTouched(from, to, options.timeZone);
      const quote = quotePrice(dayRows, days * DAY);
      return quote ? { ...quote, mode: "CALENDAR_DAYS", calendarDays: days } : null;
    }
  }
  return quotePrice(rows, elapsedMinutes);
}
