import { prisma } from "@thrice/db";
import { apiError, authenticate, isResponse, json, parseInstant } from "@/lib/public-api";
import { quoteVariantPrice } from "@/lib/pricing";

// GET /api/public/v1/quote?variantId=&start=&end=  -> { amount, currency }
// Priced by the same engine as staff bookings. `amount` is null when the variant has no rate for the window.
export async function GET(req: Request) {
  const ctx = await authenticate(req);
  if (isResponse(ctx)) return ctx;

  const sp = new URL(req.url).searchParams;
  const variantId = sp.get("variantId");
  const start = parseInstant(sp.get("start"));
  const end = parseInstant(sp.get("end"));
  if (!variantId || !start || !end || end <= start) return apiError(400, "INVALID_PARAMS", "variantId, start and end are required, and end must be after start.");

  const variant = await prisma.productVariant.findFirst({ where: { id: variantId, storeId: ctx.storeId }, select: { id: true, store: { select: { currency: true } } } });
  if (!variant) return apiError(404, "NOT_FOUND", "Unknown variant.");

  const quote = await quoteVariantPrice(variant.id, start, end);
  return json({ amount: quote ? quote.total : null, currency: variant.store.currency });
}
