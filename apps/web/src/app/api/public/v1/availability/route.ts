import { prisma } from "@thrice/db";
import { apiError, authenticate, busyIntervals, isResponse, json, parseInstant } from "@/lib/public-api";

// GET /api/public/v1/availability?productId=&variantId=&from=&to=
// -> { busy: [{ start, end }] }   times inside the window when the variant cannot be booked
export async function GET(req: Request) {
  const ctx = await authenticate(req);
  if (isResponse(ctx)) return ctx;

  const sp = new URL(req.url).searchParams;
  const productId = sp.get("productId");
  const variantId = sp.get("variantId");
  const from = parseInstant(sp.get("from"));
  const to = parseInstant(sp.get("to"));
  if (!productId || !from || !to || to <= from) return apiError(400, "INVALID_PARAMS", "productId, from and to are required, and to must be after from.");
  if (to.getTime() - from.getTime() > 120 * 86_400_000) return apiError(400, "INVALID_RANGE", "The window may span at most 120 days.");

  // A product with several variants is busy only when every variant is; the website passes one variant per option.
  const variants = await prisma.productVariant.findMany({
    where: { storeId: ctx.storeId, productId, ...(variantId ? { id: variantId } : {}) },
    select: { id: true },
  });
  if (variants.length === 0) return apiError(404, "NOT_FOUND", "Unknown product or variant.");

  const perVariant = await Promise.all(variants.map((v) => busyIntervals(ctx.storeId, v.id, from, to)));
  // Busy for the product = busy for its first variant (they share the same physical resource in this setup).
  const busy = (perVariant[0] ?? []).map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() }));
  return json({ busy });
}
