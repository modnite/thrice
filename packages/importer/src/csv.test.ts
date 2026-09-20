import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseSemicolonCsv, parseFlexibleDate, parseDecimal, parseYesNo } from "./csv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "__fixtures__");

function readFixture(name: string) {
  return readFileSync(path.join(fixturesDir, name), "utf-8");
}

describe("parseSemicolonCsv against TWICE-format exports (made-up sample data)", () => {
  it("parses categories.csv, merging embedded-newline descriptions into single logical rows", () => {
    const rows = parseSemicolonCsv(readFixture("categories.csv"));
    // 6 logical CSV records even though the file has more raw text lines,
    // because some Description fields contain embedded newlines inside quotes.
    expect(rows.length).toBe(6);
    const fees = rows.find((r) => r["Category"] === "Fees & Additional Charges");
    expect(fees).toBeDefined();
    expect(fees?.["Description"]).toContain("Where a fixed price is not displayed");
    expect(fees?.["Description"]).toContain("\n");
  });

  it("parses products.csv with correct row count", () => {
    const rows = parseSemicolonCsv(readFixture("products.csv"));
    expect(rows.length).toBe(12);
    expect(rows[0]["Product"]).toBe("City Bike");
    expect(rows[0]["Price from (USD)"]).toBe("12.00");
  });

  it("parses skus.csv with correct row count", () => {
    const rows = parseSemicolonCsv(readFixture("skus.csv"));
    expect(rows.length).toBe(12);
    expect(rows[0]["SKU Code"]).toBe("BIKE-CITY");
  });

  it("parses articles.csv (double-header quirk) and can drop the label row", () => {
    const rows = parseSemicolonCsv(readFixture("articles.csv"));
    expect(rows.length).toBe(17);
    const withoutLabelRow = rows.filter((r) => r["id"] !== "Internal ID");
    expect(withoutLabelRow.length).toBe(16);
    expect(withoutLabelRow[0]["article_code"]).toBe("BIK0001A1");
  });
});

describe("field parsers", () => {
  it("parses dd.mm.yyyy dates", () => {
    const d = parseFlexibleDate("10.02.2021");
    expect(d?.toISOString().slice(0, 10)).toBe("2021-02-10");
  });

  it("parses yyyy-mm-dd dates", () => {
    const d = parseFlexibleDate("2023-11-21");
    expect(d?.toISOString().slice(0, 10)).toBe("2023-11-21");
  });

  it("returns null for blank/dash dates", () => {
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate("-")).toBeNull();
  });

  it("parses decimals and strips thousands separators", () => {
    expect(parseDecimal("4799.95")).toBe(4799.95);
    expect(parseDecimal("2,050.00")).toBe(2050);
    expect(parseDecimal("")).toBeNull();
  });

  it("parses yes/no", () => {
    expect(parseYesNo("Yes")).toBe(true);
    expect(parseYesNo("No")).toBe(false);
    expect(parseYesNo("")).toBe(false);
  });
});
