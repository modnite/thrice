import { describe, expect, it } from "vitest";
import { calendarDaysTouched, quoteBooking, quotePrice } from "./pricing.js";

const H = 60;
const D = 24 * 60;
const W = 7 * D;

describe("quotePrice (elapsed)", () => {
  it("returns null with no rates", () => {
    expect(quotePrice([], 60)).toBeNull();
  });

  it("charges a flat rate whatever the duration", () => {
    expect(quotePrice([{ durationMinutes: null, price: 100 }], 5 * D)?.total).toBe(100);
  });

  it("uses the exact row when the duration matches", () => {
    const rows = [
      { durationMinutes: H, price: 20 },
      { durationMinutes: D, price: 100 },
    ];
    expect(quotePrice(rows, D)?.total).toBe(100);
    expect(quotePrice(rows, H)?.total).toBe(20);
  });

  it("repeats the longest fitting row (3 days = 3 x 1 day)", () => {
    const q = quotePrice([{ durationMinutes: D, price: 100 }], 3 * D)!;
    expect(q.total).toBe(300);
    expect(q.blocks).toHaveLength(3);
  });

  it("uses the additional price for blocks after the first", () => {
    expect(quotePrice([{ durationMinutes: D, price: 100, additionalPrice: 60 }], 3 * D)?.total).toBe(220);
  });

  it("matches TWICE's documented example: 9 days = 1 week + 2 days", () => {
    const rows = [
      { durationMinutes: D, price: 40 },
      { durationMinutes: 3 * D, price: 100 },
      { durationMinutes: W, price: 180 },
    ];
    const q = quotePrice(rows, 9 * D)!;
    expect(q.total).toBe(260);
    expect(q.blocks.map((b) => b.durationMinutes)).toEqual([W, D, D]);
  });

  it("combines rows: 1 day + 2 hours", () => {
    const rows = [
      { durationMinutes: H, price: 10 },
      { durationMinutes: D, price: 100 },
    ];
    expect(quotePrice(rows, D + 2 * H)?.total).toBe(120);
  });

  it("charges a remainder shorter than every row as one block of the shortest row", () => {
    const rows = [
      { durationMinutes: H, price: 10 },
      { durationMinutes: D, price: 100 },
    ];
    expect(quotePrice(rows, D + 10)?.total).toBe(110);
  });

  it("does NOT round up to a bigger row just because it is cheaper (TWICE takes the longest row that fits)", () => {
    const rows = [
      { durationMinutes: H, price: 10 },
      { durationMinutes: D, price: 100 },
    ];
    expect(quotePrice(rows, 23 * H)?.total).toBe(230);
  });

  it("charges the shortest row for a booking shorter than every row", () => {
    expect(quotePrice([{ durationMinutes: 2 * H, price: 30 }], 30)?.total).toBe(30);
  });
});

describe("calendar days (Starting at)", () => {
  const tz = "America/Port_of_Spain"; // UTC-4, no daylight saving
  const at = (iso: string) => new Date(iso);

  it("counts the calendar days a booking touches", () => {
    // 23:00 to 01:00 local (03:00 to 05:00 UTC next day) touches two days.
    expect(calendarDaysTouched(at("2026-09-19T03:00:00Z"), at("2026-09-19T05:00:00Z"), tz)).toBe(2);
    // Same local day.
    expect(calendarDaysTouched(at("2026-09-19T14:00:00Z"), at("2026-09-19T20:00:00Z"), tz)).toBe(1);
  });

  it("does not count the day the return instant merely lands on at midnight", () => {
    // 12:00 local Sat to 00:00 local Mon = Saturday and Sunday only.
    expect(calendarDaysTouched(at("2026-09-19T16:00:00Z"), at("2026-09-21T04:00:00Z"), tz)).toBe(2);
  });

  it("prices touched days with the day rows", () => {
    const rows = [{ durationMinutes: D, price: 100 }];
    // Sat 12:00 to Mon 12:00 elapsed is 2 days but touches 3 calendar days.
    const from = at("2026-09-19T16:00:00Z");
    const to = at("2026-09-21T16:00:00Z");
    expect(quoteBooking(rows, from, to, { mode: "ELAPSED", timeZone: tz })?.total).toBe(200);
    const cal = quoteBooking(rows, from, to, { mode: "CALENDAR_DAYS", timeZone: tz })!;
    expect(cal.total).toBe(300);
    expect(cal.calendarDays).toBe(3);
  });

  it("falls back to elapsed pricing when there are no whole-day rows", () => {
    const rows = [{ durationMinutes: H, price: 10 }];
    const q = quoteBooking(rows, at("2026-09-19T16:00:00Z"), at("2026-09-19T18:00:00Z"), { mode: "CALENDAR_DAYS", timeZone: tz })!;
    expect(q.mode).toBe("ELAPSED");
    expect(q.total).toBe(20);
  });
});
