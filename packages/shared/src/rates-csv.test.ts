import { describe, expect, it } from "vitest";
import { parseCsvText, parseRatesCsv, ratesToCsv } from "./rates-csv.js";

describe("parseCsvText", () => {
  it("handles quotes, embedded delimiters and a BOM", () => {
    const rows = parseCsvText('﻿a;b\r\n"x;y";"say ""hi"""\r\n');
    expect(rows).toEqual([["a", "b"], ["x;y", 'say "hi"']]);
  });
  it("detects a comma delimiter", () => {
    expect(parseCsvText("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseRatesCsv", () => {
  const header = "product;variant;mode;duration;unit;price;additional price\n";

  it("groups rows into one variant with converted durations", () => {
    const r = parseRatesCsv(header + "Sony FX3;;elapsed;1;day;350;250\nSony FX3;;elapsed;1;week;1 800.00;\n");
    expect(r.errors).toEqual([]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].variant).toBe("Default");
    expect(r.groups[0].rows).toEqual([
      { durationMinutes: 1440, price: 350, additionalPrice: 250 },
      { durationMinutes: 10080, price: 1800, additionalPrice: null },
    ]);
  });

  it("reads a flat price and calendar mode", () => {
    const r = parseRatesCsv(header + "Tripod;;;;flat;40;\nLens;;starting at;1;day;80;\n");
    expect(r.errors).toEqual([]);
    expect(r.groups.find((g) => g.product === "Tripod")?.rows[0]).toEqual({ durationMinutes: null, price: 40, additionalPrice: null });
    expect(r.groups.find((g) => g.product === "Lens")?.mode).toBe("CALENDAR_DAYS");
  });

  it("skips blank template rows silently", () => {
    const r = parseRatesCsv(header + "Sony FX3;;elapsed;;;;\n");
    expect(r.errors).toEqual([]);
    expect(r.groups).toEqual([]);
  });

  it("drops a whole product when any of its rows is bad, and says why", () => {
    const r = parseRatesCsv(header + "Sony FX3;;elapsed;1;day;abc;\nSony FX3;;elapsed;1;week;1800;\nTripod;;;;flat;40;\n");
    expect(r.groups.map((g) => g.product)).toEqual(["Tripod"]);
    expect(r.errors[0]).toMatchObject({ line: 2 });
  });

  it("rejects calendar mode with hourly rates and mixed flat and timed rows", () => {
    const cal = parseRatesCsv(header + "A;;calendar;2;hours;10;\n");
    expect(cal.groups).toEqual([]);
    expect(cal.errors[0].message).toMatch(/whole days/);
    const mixed = parseRatesCsv(header + "B;;;;flat;10;\nB;;;1;day;20;\n");
    expect(mixed.errors[0].message).toMatch(/flat price with duration/);
  });

  it("requires the product and price columns", () => {
    expect(parseRatesCsv("name;cost\nx;1").errors[0].message).toMatch(/product/);
  });

  it("round-trips through the export format", () => {
    const groups = [
      { product: "Sony FX3", variant: "Default", mode: "ELAPSED" as const, rows: [{ durationMinutes: 1440, price: 350, additionalPrice: 250 }, { durationMinutes: 60, price: 40, additionalPrice: null }] },
      { product: "Tripod", variant: "Kit", mode: "CALENDAR_DAYS" as const, rows: [{ durationMinutes: 10080, price: 200, additionalPrice: null }] },
      { product: "Flat one", variant: "Default", mode: "ELAPSED" as const, rows: [{ durationMinutes: null, price: 99, additionalPrice: null }] },
    ];
    const parsed = parseRatesCsv(ratesToCsv(groups));
    expect(parsed.errors).toEqual([]);
    expect(parsed.groups).toEqual(groups);
  });
});
