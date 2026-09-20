import { prisma } from "@thrice/db";
import { parseSemicolonCsv, parseYesNo } from "./csv.js";
import { emptyReport, type ImportReport } from "./report.js";

export type SkusImportResult = {
  report: ImportReport;
  skuCodeToSkuId: Map<string, string>;
};

/**
 * Every SKU with a primary product gets a "Default" single-slot variant
 * pointing at it, so the booking engine has one uniform variant-based path
 * regardless of whether a product is a simple single-SKU item or a real
 * multi-slot bundle (those get additional variants/slots created separately,
 * outside the CSV import path).
 */
async function ensureDefaultVariant(storeId: string, productId: string, skuId: string) {
  const variant = await prisma.productVariant.upsert({
    where: { storeId_productId_name: { storeId, productId, name: "Default" } },
    update: {},
    create: { storeId, productId, name: "Default", displayOrder: 0 },
  });
  const slot = await prisma.variantResourceSlot.upsert({
    where: { variantId_slotIndex: { variantId: variant.id, slotIndex: 0 } },
    update: {},
    create: { variantId: variant.id, slotIndex: 0, quantity: 1 },
  });
  await prisma.variantSlotSkuOption.upsert({
    where: { slotId_skuId: { slotId: slot.id, skuId } },
    update: {},
    create: { slotId: slot.id, skuId },
  });

  // Products imported from the flat CSV column have no real duration
  // brackets, so give the Default variant a single flat/open-ended tier at
  // the product's priceFrom. Real tiered pricing can be added later without
  // touching this — it's just the first tier in the list.
  const existingTier = await prisma.priceTier.findFirst({ where: { variantId: variant.id } });
  if (!existingTier) {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    await prisma.priceTier.create({
      data: { storeId, variantId: variant.id, durationMinutes: null, price: product.priceFrom, displayOrder: 0 },
    });
  }
}

export async function importSkus(
  storeId: string,
  csvContent: string,
  skuCodeToProductId: Map<string, string>
): Promise<SkusImportResult> {
  const rows = parseSemicolonCsv(csvContent);
  const report = emptyReport();
  report.total = rows.length;
  const skuCodeToSkuId = new Map<string, string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      const code = row["SKU Code"]?.trim();
      if (!code) {
        report.skipped++;
        report.errors.push({ row: rowNum, message: "Missing SKU Code", data: row });
        continue;
      }
      const name = row["SKU Name"]?.trim() || code;
      const trackedIndividually = parseYesNo(row["Tracked individually"]);
      // Not every SKU in TWICE's export is directly referenced by a product's
      // "Inventory" column — some are only used as bundle/accessory SKUs from
      // another product's variant. Those are still created, just without a
      // primary product (and so without a Default variant of their own).
      const productId = skuCodeToProductId.get(code) ?? null;

      const existing = await prisma.sku.findUnique({ where: { storeId_code: { storeId, code } } });

      const sku = await prisma.sku.upsert({
        where: { storeId_code: { storeId, code } },
        update: { name, trackedIndividually, productId: productId ?? existing?.productId },
        create: { storeId, productId, code, name, trackedIndividually },
      });

      if (productId) {
        await ensureDefaultVariant(storeId, productId, sku.id);
      }

      skuCodeToSkuId.set(code, sku.id);
      if (existing) report.updated++;
      else report.created++;
    } catch (err) {
      report.errored++;
      report.errors.push({ row: rowNum, message: (err as Error).message, data: row });
    }
  }

  return { report, skuCodeToSkuId };
}
