import { prisma, type Prisma } from "@thrice/db";
import { quoteBooking, type PriceQuote } from "@thrice/shared";

type Tx = Prisma.TransactionClient;

/**
 * Prices one unit of a variant for a booking window from the variant's rate rows and pricing mode
 * (see quoteBooking for the rules). Always resolved server-side from the database: the client never
 * gets to say what a booking costs. Returns null when the variant has no rates at all.
 */
export async function quoteVariantPrice(
  variantId: string,
  from: Date,
  to: Date,
  client: Tx | typeof prisma = prisma
): Promise<PriceQuote | null> {
  const variant = await client.productVariant.findUnique({
    where: { id: variantId },
    select: { pricingMode: true, store: { select: { timezone: true } }, priceTiers: true },
  });
  if (!variant) return null;

  return quoteBooking(
    variant.priceTiers.map((t) => ({
      durationMinutes: t.durationMinutes,
      price: Number(t.price),
      additionalPrice: t.additionalPrice === null ? null : Number(t.additionalPrice),
    })),
    from,
    to,
    { mode: variant.pricingMode, timeZone: variant.store.timezone }
  );
}
