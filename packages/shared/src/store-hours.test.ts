import { describe, expect, it } from "vitest";
import { holidaysSchema, isWithinOpeningHours, type HolidaysConfig, type OpeningHours } from "./store-hours";

// Weekdays 8am to 4pm, weekends 8am to 1pm.
const hours: OpeningHours = {
  "0": { open: "08:00", close: "13:00" },
  "1": { open: "08:00", close: "16:00" },
  "2": { open: "08:00", close: "16:00" },
  "3": { open: "08:00", close: "16:00" },
  "4": { open: "08:00", close: "16:00" },
  "5": { open: "08:00", close: "16:00" },
  "6": { open: "08:00", close: "13:00" },
};
const tz = "America/Port_of_Spain"; // UTC-4, no daylight saving
// 2026-09-24 is a Thursday (used as a holiday in these tests).
const at = (ymd: string, hhmm: string) => new Date(`${ymd}T${hhmm}:00-04:00`);
const holiday = (mode: HolidaysConfig["hours"]["mode"], extra: Partial<HolidaysConfig["hours"]> = {}): HolidaysConfig => ({
  hours: { mode, ...extra },
  dates: [{ date: "2026-09-24", name: "Founders Day" }],
});

describe("opening hours with holidays", () => {
  it("uses weekday hours on a normal Thursday", () => {
    expect(isWithinOpeningHours(hours, at("2026-09-24", "15:00"), tz)).toBe(true);
    expect(isWithinOpeningHours(hours, at("2026-09-24", "15:00"), tz, { hours: { mode: "sunday" }, dates: [] })).toBe(true);
  });

  it("uses weekend hours on a holiday that falls on a weekday", () => {
    const h = holiday("sunday");
    expect(isWithinOpeningHours(hours, at("2026-09-24", "12:30"), tz, h)).toBe(true);
    expect(isWithinOpeningHours(hours, at("2026-09-24", "15:00"), tz, h)).toBe(false);
    expect(isWithinOpeningHours(hours, at("2026-09-24", "07:30"), tz, h)).toBe(false);
  });

  it("does not change the neighbouring days", () => {
    const h = holiday("sunday");
    expect(isWithinOpeningHours(hours, at("2026-09-23", "15:00"), tz, h)).toBe(true);
    expect(isWithinOpeningHours(hours, at("2026-09-25", "15:00"), tz, h)).toBe(true);
  });

  it("reads the holiday date in the store's timezone, not UTC", () => {
    // 9pm on the 23rd local is already the 24th in UTC. It must still count as the 23rd.
    expect(isWithinOpeningHours(hours, new Date("2026-09-24T01:00:00Z"), tz, holiday("closed"))).toBe(false); // closed anyway at 9pm
    expect(isWithinOpeningHours(hours, at("2026-09-23", "15:00"), tz, holiday("closed"))).toBe(true);
  });

  it("supports closed and custom holiday hours", () => {
    expect(isWithinOpeningHours(hours, at("2026-09-24", "10:00"), tz, holiday("closed"))).toBe(false);
    const custom = holiday("custom", { open: "09:00", close: "11:00" });
    expect(isWithinOpeningHours(hours, at("2026-09-24", "10:00"), tz, custom)).toBe(true);
    expect(isWithinOpeningHours(hours, at("2026-09-24", "12:00"), tz, custom)).toBe(false);
  });

  it("validates the holiday config", () => {
    expect(holidaysSchema.safeParse(holiday("sunday")).success).toBe(true);
    expect(holidaysSchema.safeParse(holiday("custom")).success).toBe(false);
    expect(holidaysSchema.safeParse(holiday("custom", { open: "10:00", close: "09:00" })).success).toBe(false);
    expect(holidaysSchema.safeParse({ hours: { mode: "sunday" }, dates: [{ date: "24/09/2026" }] }).success).toBe(false);
  });
});
