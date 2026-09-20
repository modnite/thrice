import { prisma } from "@thrice/db";
import { parseSemicolonCsv, splitMulti, parseDecimal, parseFlexibleDate } from "./csv.js";
import { emptyReport, type ImportReport } from "./report.js";

const SALES_CHANNEL_MAP: Record<string, string> = {
  online: "ONLINE",
  admin: "ADMIN",
  "check-in": "CHECKIN",
  checkin: "CHECKIN",
};

export type ProductsImportResult = {
  report: ImportReport;
  // "Inventory" column on a product row is that product's primary SKU code.
  // Used to link SKUs to their product during the SKU import step.
  skuCodeToProductId: Map<string, string>;
};

export async function importProducts(storeId: string, csvContent: string): Promise<ProductsImportResult> {
  const rows = parseSemicolonCsv(csvContent);
  const report = emptyReport();
  report.total = rows.length;
  const skuCodeToProductId = new Map<string, string>();

  const allCategories = await prisma.category.findMany({ where: { storeId } });
  const categoryByName = new Map(allCategories.map((c) => [c.name, c.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      const name = row["Product"]?.trim();
      if (!name) {
        report.skipped++;
        report.errors.push({ row: rowNum, message: "Missing Product name", data: row });
        continue;
      }

      const statusRaw = row["Status"]?.trim().toLowerCase();
      const status = statusRaw === "hidden" ? "HIDDEN" : "PUBLIC";
      const tags = splitMulti(row["Tags"]);
      const salesChannels = splitMulti(row["Sales channels"]).map(
        (c) => SALES_CHANNEL_MAP[c.toLowerCase()] ?? c.toUpperCase()
      );
      const categoryNames = splitMulti(row["Product categories"]);
      const categoryIds = categoryNames
        .map((n) => categoryByName.get(n))
        .filter((id): id is string => Boolean(id));

      // TWICE names these columns with the store currency, for example "Price from (USD)". Match on the start.
      const byPrefix = (prefix: string) => row[Object.keys(row).find((k) => k.startsWith(prefix)) ?? ""];
      const priceFrom = parseDecimal(byPrefix("Price from")) ?? 0;
      const deposit = parseDecimal(byPrefix("Deposit")) ?? 0;
      const taxPercentage = parseDecimal(row["Tax percentage"]);
      const createdAt = parseFlexibleDate(row["Created"]) ?? undefined;
      const skuCode = row["Inventory"]?.trim();

      const existing = await prisma.product.findUnique({
        where: { storeId_name: { storeId, name } },
      });

      const product = await prisma.product.upsert({
        where: { storeId_name: { storeId, name } },
        update: {
          status,
          tags,
          salesChannels,
          priceFrom,
          deposit,
          taxPercentage: taxPercentage ?? null,
          categories: {
            deleteMany: {},
            create: categoryIds.map((categoryId) => ({ categoryId })),
          },
        },
        create: {
          storeId,
          name,
          status,
          tags,
          salesChannels,
          priceFrom,
          deposit,
          taxPercentage: taxPercentage ?? null,
          ...(createdAt ? { createdAt } : {}),
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        },
      });

      if (skuCode) skuCodeToProductId.set(skuCode, product.id);

      if (existing) report.updated++;
      else report.created++;
    } catch (err) {
      report.errored++;
      report.errors.push({ row: rowNum, message: (err as Error).message, data: row });
    }
  }

  return { report, skuCodeToProductId };
}
