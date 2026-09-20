import type { Prisma, PricingMode } from "@thrice/db";

type Tx = Prisma.TransactionClient;

export type RateInput = { durationMinutes: number | null; price: number; additionalPrice: number | null };

/**
 * Replaces all of a variant's rates and its pricing mode in one step, and keeps the product's
 * "price from" (its cheapest rate anywhere) in step. Used by the pricing editor and the
 * rates spreadsheet import so both behave identically.
 */
export async function replaceVariantRates(
  tx: Tx,
  storeId: string,
  variant: { id: string; productId: string },
  mode: PricingMode,
  rows: RateInput[]
): Promise<void> {
  const ordered = [...rows].sort((a, b) => (a.durationMinutes ?? 0) - (b.durationMinutes ?? 0));
  await tx.productVariant.update({ where: { id: variant.id }, data: { pricingMode: mode } });
  await tx.priceTier.deleteMany({ where: { variantId: variant.id } });
  if (ordered.length > 0) {
    await tx.priceTier.createMany({
      data: ordered.map((r, i) => ({
        storeId,
        variantId: variant.id,
        durationMinutes: r.durationMinutes,
        price: r.price,
        additionalPrice: r.additionalPrice,
        displayOrder: i,
      })),
    });
  }
  const all = await tx.priceTier.findMany({ where: { variant: { productId: variant.productId } }, select: { price: true } });
  const cheapest = all.length > 0 ? Math.min(...all.map((t) => Number(t.price))) : 0;
  await tx.product.update({ where: { id: variant.productId }, data: { priceFrom: cheapest } });
}
