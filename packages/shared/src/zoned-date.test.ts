import { describe, expect, it } from "vitest";
import { zonedDayBounds, zonedDayStart, zonedToday } from "./zoned-date.js";

describe("zoned dates (America/Port_of_Spain, UTC-4 all year)", () => {
  const tz = "America/Port_of_Spain";

  it("starts a local day at 04:00 UTC", () => {
    expect(zonedDayStart("2026-09-19", tz).toISOString()).toBe("2026-09-19T04:00:00.000Z");
  });

  it("reads today in the timezone, not in UTC", () => {
    // 01:00 UTC on the 19th is still the evening of the 18th in Port of Spain (UTC-4).
    expect(zonedToday(tz, new Date("2026-09-19T01:00:00Z"))).toBe("2026-09-18");
    expect(zonedToday(tz, new Date("2026-09-19T05:00:00Z"))).toBe("2026-09-19");
  });

  it("gives 24 hour bounds", () => {
    const { start, end } = zonedDayBounds(tz, new Date("2026-09-19T15:00:00Z"));
    expect(start.toISOString()).toBe("2026-09-19T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-20T04:00:00.000Z");
  });

  it("handles a zone ahead of UTC", () => {
    expect(zonedDayStart("2026-09-19", "Asia/Tokyo").toISOString()).toBe("2026-09-18T15:00:00.000Z");
  });
});
