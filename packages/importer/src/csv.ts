import { parse } from "csv-parse/sync";

export function parseSemicolonCsv(content: string): Record<string, string>[] {
  // TWICE/Rentle exports are semicolon-delimited, RFC4180-quoted, and can contain
  // embedded newlines inside quoted fields (e.g. multi-paragraph category descriptions).
  const records = parse(content, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });
  return records as Record<string, string>[];
}

export function splitMulti(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseDecimal(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "-") return null;
  const cleaned = trimmed.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseIntSafe(value: string | undefined | null): number | null {
  const n = parseDecimal(value);
  return n === null ? null : Math.trunc(n);
}

// Handles "dd.mm.yyyy" (products.csv "Created") and "yyyy-mm-dd" (articles.csv "Purchase Date")
export function parseFlexibleDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "-") return null;

  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, d, m, y] = dotMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function parseYesNo(value: string | undefined | null): boolean {
  return (value ?? "").trim().toLowerCase() === "yes";
}
