import { prisma } from "@thrice/db";
import { parseSemicolonCsv, parseDecimal, parseIntSafe, parseFlexibleDate, parseYesNo } from "./csv.js";
import { emptyReport, type ImportReport } from "./report.js";

const STATUS_VALUES = new Set(["IN_USE", "OUT_OF_USE", "LOST"]);
const STATE_VALUES = new Set(["IN", "OUT"]);

function parseUsageHours(value: string | undefined | null): number {
  if (!value) return 0;
  const n = parseDecimal(value.replace(/\s*h\s*$/i, ""));
  return n ?? 0;
}

// Bulk (non-individually-tracked) SKUs are exported as one aggregate row per
// SKU with no article_code, and their status/allocations fields carry a
// ":count" suffix (e.g. "IN_USE:2", "rental:2,sales:0") rather than the
// plain values a per-unit row has. Strip that suffix to get the real value.
function baseToken(value: string | undefined | null): string {
  return (value?.trim() ?? "").split(/[:,]/)[0].trim();
}

export async function importArticles(
  storeId: string,
  csvContent: string,
  skuCodeToSkuId: Map<string, string>
): Promise<ImportReport> {
  let rows = parseSemicolonCsv(csvContent);
  // This export has a second, human-label header row ("Internal ID;Article ID;...")
  // baked into the data. Drop it if present.
  rows = rows.filter((r) => r["id"] !== "Internal ID");

  const report = emptyReport();
  report.total = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 3; // two header rows precede the data in this file
    try {
      const skuCode = row["sku_code"]?.trim();
      if (!skuCode) {
        report.skipped++;
        report.errors.push({ row: rowNum, message: "Missing sku_code", data: row });
        continue;
      }

      const skuId = skuCodeToSkuId.get(skuCode);
      if (!skuId) {
        report.skipped++;
        report.errors.push({
          row: rowNum,
          message: `Unknown SKU code "${skuCode}" — import SKUs before articles`,
          data: row,
        });
        continue;
      }

      const trackedIndividually = parseYesNo(row["tracked_individually"]);
      const rawArticleCode = row["article_code"]?.trim();

      if (!rawArticleCode && trackedIndividually) {
        // A genuinely individually-tracked SKU with no serial on this row —
        // nothing to key it on, unlike a bulk aggregate row.
        report.skipped++;
        report.errors.push({ row: rowNum, message: "Missing article_code for a tracked-individually SKU", data: row });
        continue;
      }

      // Bulk SKUs export as a single aggregate row with no article_code —
      // the SKU code itself is a safe, stable, unique-per-store key for it.
      const articleCode = rawArticleCode || skuCode;

      const statusRaw = baseToken(row["status"]).toUpperCase() || "IN_USE";
      const status = STATUS_VALUES.has(statusRaw) ? statusRaw : "IN_USE";

      const allocationRaw = baseToken(row["allocations"]).toUpperCase() || "RENTAL";
      const allocation = allocationRaw === "SALE" ? "SALE" : "RENTAL";

      const stateRaw = (row["state"]?.trim() || "In").toUpperCase();
      const currentState = STATE_VALUES.has(stateRaw) ? stateRaw : "IN";

      const usageCount = parseIntSafe(row["usageCount"]) ?? 0;
      const usageHours = parseUsageHours(row["usageHours"]);
      const quantity = parseIntSafe(row["quantity"]) ?? 1;
      const purchaseDate = parseFlexibleDate(row["purchase_date"]);
      const purchasePrice = parseDecimal(row["purchase_price"]);
      const purchaseCurrency = row["purchase_currency"]?.trim() || null;

      const existing = await prisma.article.findUnique({
        where: { storeId_articleCode: { storeId, articleCode } },
      });

      await prisma.article.upsert({
        where: { storeId_articleCode: { storeId, articleCode } },
        update: {
          skuId,
          status: status as "IN_USE" | "OUT_OF_USE" | "LOST",
          allocation: allocation as "RENTAL" | "SALE",
          usageCount,
          usageHours,
          quantity,
          currentState: currentState as "IN" | "OUT",
          purchaseDate,
          purchasePrice,
          purchaseCurrency,
        },
        create: {
          storeId,
          skuId,
          articleCode,
          status: status as "IN_USE" | "OUT_OF_USE" | "LOST",
          allocation: allocation as "RENTAL" | "SALE",
          usageCount,
          usageHours,
          quantity,
          currentState: currentState as "IN" | "OUT",
          purchaseDate,
          purchasePrice,
          purchaseCurrency,
        },
      });

      if (existing) report.updated++;
      else report.created++;
    } catch (err) {
      report.errored++;
      report.errors.push({ row: rowNum, message: (err as Error).message, data: row });
    }
  }

  return report;
}
