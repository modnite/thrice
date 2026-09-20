import { prisma } from "@thrice/db";
import { importCategories } from "./import-categories.js";
import { importProducts } from "./import-products.js";
import { importSkus } from "./import-skus.js";
import { importArticles } from "./import-articles.js";
import type { ImportReport } from "./report.js";

export * from "./csv.js";
export * from "./report.js";
export { importCategories } from "./import-categories.js";
export { importProducts } from "./import-products.js";
export { importSkus } from "./import-skus.js";
export { importArticles } from "./import-articles.js";

export type ImportFileType = "CATEGORIES" | "PRODUCTS" | "SKUS" | "ARTICLES";

async function recordRun(
  storeId: string,
  fileType: ImportFileType,
  fileName: string,
  report: ImportReport
) {
  await prisma.importRun.create({
    data: {
      storeId,
      fileType,
      fileName,
      status: report.errored > 0 && report.created + report.updated === 0 ? "FAILED" : "COMPLETED",
      rowsTotal: report.total,
      rowsCreated: report.created,
      rowsUpdated: report.updated,
      rowsSkipped: report.skipped,
      rowsErrored: report.errored,
      errors: report.errors.length ? (report.errors as unknown as object) : undefined,
      finishedAt: new Date(),
    },
  });
}

export type FullImportInput = {
  categoriesCsv?: { fileName: string; content: string };
  productsCsv?: { fileName: string; content: string };
  skusCsv?: { fileName: string; content: string };
  articlesCsv?: { fileName: string; content: string };
};

export type FullImportResult = {
  categories?: ImportReport;
  products?: ImportReport;
  skus?: ImportReport;
  articles?: ImportReport;
};

/**
 * Runs the full migration pipeline in dependency order: Categories -> Products -> SKUs -> Articles.
 * Each stage is idempotent (upsert on natural keys), so re-running with a fresh export is safe.
 */
export async function runFullImport(storeId: string, input: FullImportInput): Promise<FullImportResult> {
  const result: FullImportResult = {};
  let skuCodeToProductId = new Map<string, string>();
  let skuCodeToSkuId = new Map<string, string>();

  if (input.categoriesCsv) {
    const report = await importCategories(storeId, input.categoriesCsv.content);
    await recordRun(storeId, "CATEGORIES", input.categoriesCsv.fileName, report);
    result.categories = report;
  }

  if (input.productsCsv) {
    const { report, skuCodeToProductId: map } = await importProducts(storeId, input.productsCsv.content);
    await recordRun(storeId, "PRODUCTS", input.productsCsv.fileName, report);
    result.products = report;
    skuCodeToProductId = map;
  }

  if (input.skusCsv) {
    if (skuCodeToProductId.size === 0) {
      // products weren't imported this run; rebuild the map from existing products/skus
      const skus = await prisma.sku.findMany({ where: { storeId }, select: { code: true, productId: true } });
      skuCodeToProductId = new Map(
        skus.filter((s): s is typeof s & { productId: string } => s.productId !== null).map((s) => [s.code, s.productId])
      );
    }
    const { report, skuCodeToSkuId: map } = await importSkus(storeId, input.skusCsv.content, skuCodeToProductId);
    await recordRun(storeId, "SKUS", input.skusCsv.fileName, report);
    result.skus = report;
    skuCodeToSkuId = map;
  }

  if (input.articlesCsv) {
    if (skuCodeToSkuId.size === 0) {
      const skus = await prisma.sku.findMany({ where: { storeId }, select: { code: true, id: true } });
      skuCodeToSkuId = new Map(skus.map((s) => [s.code, s.id]));
    }
    const report = await importArticles(storeId, input.articlesCsv.content, skuCodeToSkuId);
    await recordRun(storeId, "ARTICLES", input.articlesCsv.fileName, report);
    result.articles = report;
  }

  return result;
}
