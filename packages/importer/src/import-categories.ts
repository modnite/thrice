import { prisma } from "@thrice/db";
import { parseSemicolonCsv, parseIntSafe } from "./csv.js";
import { emptyReport, type ImportReport } from "./report.js";

export async function importCategories(storeId: string, csvContent: string): Promise<ImportReport> {
  const rows = parseSemicolonCsv(csvContent);
  const report = emptyReport();
  report.total = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // account for header row, 1-indexed
    try {
      const name = row["Category"]?.trim();
      if (!name) {
        report.skipped++;
        report.errors.push({ row: rowNum, message: "Missing Category name", data: row });
        continue;
      }
      const description = row["Description"]?.trim() || null;
      const displayOrder = parseIntSafe(row["Display order"]) ?? 0;

      const existing = await prisma.category.findUnique({
        where: { storeId_name: { storeId, name } },
      });

      await prisma.category.upsert({
        where: { storeId_name: { storeId, name } },
        update: { description, displayOrder },
        create: { storeId, name, description, displayOrder },
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
