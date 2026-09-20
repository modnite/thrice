// Rates spreadsheet: one row per rate, so a rate card can be filled in in Excel and uploaded.
//
//   product;variant;mode;duration;unit;price;additional price
//   Sony FX3;;elapsed;1;day;350;250
//   Sony FX3;;elapsed;1;week;1800;
//   Tripod;;;;flat;40;
//
// "variant" defaults to Default, "mode" to elapsed. A flat price has no duration. Rows that are
// completely blank in duration, unit and price are template placeholders and are ignored.

import type { PricingMode } from "./pricing.js";

export type RatesGroupRow = { durationMinutes: number | null; price: number; additionalPrice: number | null };
export type RatesGroup = { product: string; variant: string; mode: PricingMode; rows: RatesGroupRow[] };
export type RatesCsvResult = { groups: RatesGroup[]; errors: { line: number; message: string }[] };

const UNIT_MINUTES: Record<string, number> = {
  minute: 1, minutes: 1, min: 1, mins: 1, m: 1,
  hour: 60, hours: 60, hr: 60, hrs: 60, h: 60,
  day: 1440, days: 1440, d: 1440,
  week: 10080, weeks: 10080, w: 10080,
};

/** Splits CSV text into rows, honouring quotes. The delimiter (; or ,) is detected from the header line. */
export function parseCsvText(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) && firstLine.includes(";") ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function parseNumber(raw: string, decimalComma: boolean): number {
  let s = raw.trim().replace(/[\s ]/g, "").replace(/^TT\$/i, "");
  if (decimalComma && s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  return s === "" ? NaN : Number(s);
}

function parseMode(raw: string): PricingMode | null {
  const s = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (s === "" || s === "elapsed" || s === "elapsed duration") return "ELAPSED";
  if (s === "calendar" || s === "calendar days" || s === "starting at") return "CALENDAR_DAYS";
  return null;
}

const HEADER_ALIASES: Record<string, string> = {
  product: "product",
  variant: "variant",
  mode: "mode",
  duration: "duration",
  unit: "unit",
  price: "price",
  "additional price": "additional",
  "additional_price": "additional",
  additional: "additional",
};

export function parseRatesCsv(text: string): RatesCsvResult {
  const table = parseCsvText(text);
  const errors: RatesCsvResult["errors"] = [];
  if (table.length === 0) return { groups: [], errors: [{ line: 1, message: "The file is empty." }] };

  const decimalComma = (text.split(/\r?\n/, 1)[0] ?? "").includes(";");
  const header = table[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? "");
  const col = (name: string) => header.indexOf(name);
  for (const required of ["product", "price"]) {
    if (col(required) < 0) return { groups: [], errors: [{ line: 1, message: `Missing the "${required}" column.` }] };
  }

  const groups = new Map<string, RatesGroup & { bad: boolean }>();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");

    const product = get("product");
    const durationRaw = get("duration");
    const unitRaw = get("unit").toLowerCase();
    const priceRaw = get("price");
    if (durationRaw === "" && (unitRaw === "" ) && priceRaw === "") return; // blank template row
    if (!product) return void errors.push({ line, message: "Missing product name." });

    const fail = (message: string) => {
      errors.push({ line, message });
      const key = `${product.toLowerCase()}|${(get("variant") || "Default").toLowerCase()}`;
      const g = groups.get(key);
      if (g) g.bad = true;
      else groups.set(key, { product, variant: get("variant") || "Default", mode: "ELAPSED", rows: [], bad: true });
    };

    const price = parseNumber(priceRaw, decimalComma);
    if (!Number.isFinite(price) || price < 0) return fail(`"${priceRaw}" is not a valid price.`);
    const additionalRaw = get("additional");
    const additional = additionalRaw === "" ? null : parseNumber(additionalRaw, decimalComma);
    if (additional !== null && (!Number.isFinite(additional) || additional < 0)) return fail(`"${additionalRaw}" is not a valid additional price.`);
    const mode = parseMode(get("mode"));
    if (!mode) return fail(`Unknown mode "${get("mode")}". Use elapsed or calendar.`);

    let durationMinutes: number | null;
    if (unitRaw === "flat" || (durationRaw === "" && unitRaw === "")) {
      durationMinutes = null;
    } else {
      const amount = parseNumber(durationRaw, decimalComma);
      const unit = UNIT_MINUTES[unitRaw];
      if (!Number.isFinite(amount) || amount <= 0) return fail(`"${durationRaw}" is not a valid duration.`);
      if (!unit) return fail(`Unknown unit "${get("unit")}". Use minutes, hours, days or weeks.`);
      durationMinutes = Math.round(amount * unit);
    }

    const variant = get("variant") || "Default";
    const key = `${product.toLowerCase()}|${variant.toLowerCase()}`;
    const group = groups.get(key) ?? { product, variant, mode, rows: [], bad: false };
    if (group.rows.length > 0 && group.mode !== mode) return fail("A product's rows must all use the same mode.");
    group.mode = mode;
    group.rows.push({ durationMinutes, price, additionalPrice: additional });
    groups.set(key, group);
  });

  const valid: RatesGroup[] = [];
  for (const g of groups.values()) {
    if (g.bad) continue;
    const label = `${g.product}${g.variant === "Default" ? "" : ` / ${g.variant}`}`;
    const flat = g.rows.filter((r) => r.durationMinutes === null);
    const timed = g.rows.filter((r) => r.durationMinutes !== null);
    const problem =
      flat.length > 0 && timed.length > 0
        ? "mixes a flat price with duration rates"
        : flat.length > 1
          ? "has more than one flat price"
          : new Set(timed.map((r) => r.durationMinutes)).size !== timed.length
            ? "has two rates with the same duration"
            : g.mode === "CALENDAR_DAYS" && (flat.length > 0 || timed.some((r) => (r.durationMinutes as number) % 1440 !== 0))
              ? "uses calendar mode but has rates that are not whole days or weeks"
              : null;
    if (problem) errors.push({ line: 0, message: `${label} ${problem}.` });
    else valid.push({ product: g.product, variant: g.variant, mode: g.mode, rows: g.rows });
  }
  return { groups: valid, errors };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The current rates as a spreadsheet the same importer can read back (also the template to fill in). */
export function ratesToCsv(
  entries: { product: string; variant: string; mode: PricingMode; rows: RatesGroupRow[] }[]
): string {
  const lines = [["product", "variant", "mode", "duration", "unit", "price", "additional price"].join(",")];
  for (const e of entries) {
    const mode = e.mode === "CALENDAR_DAYS" ? "calendar" : "elapsed";
    const base = [e.product, e.variant === "Default" ? "" : e.variant, mode];
    if (e.rows.length === 0) {
      lines.push([...base, "", "", "", ""].map(csvCell).join(","));
      continue;
    }
    for (const r of e.rows) {
      const additional = r.additionalPrice === null ? "" : r.additionalPrice;
      if (r.durationMinutes === null) {
        lines.push([...base, "", "flat", r.price, additional].map(csvCell).join(","));
        continue;
      }
      const m = r.durationMinutes;
      const [amount, unit] = m % 10080 === 0 ? [m / 10080, "week"] : m % 1440 === 0 ? [m / 1440, "day"] : m % 60 === 0 ? [m / 60, "hour"] : [m, "minute"];
      lines.push([...base, amount, `${unit}${amount === 1 ? "" : "s"}`, r.price, additional].map(csvCell).join(","));
    }
  }
  return lines.join("\r\n") + "\r\n";
}
