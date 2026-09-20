import { z } from "zod";
import { prisma } from "@thrice/db";
import { apiError, authenticate, isResponse, json, WEBSITE_NOTE_PREFIX } from "@/lib/public-api";
import { createOrder, InsufficientAvailabilityError, NoPriceTierError } from "@/lib/orders";
import { logger } from "@/lib/logger";

const body = z.object({
  productId: z.string().min(1).max(60),
  variantId: z.string().min(1).max(60),
  start: z.string().datetime(),
  end: z.string().datetime(),
  customer: z.object({
    name: z.string().trim().min(1).max(300),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().max(50),
    marketingConsent: z.boolean().optional(),
  }),
  notes: z.string().max(1500).optional(),
  /** The website's own booking reference. Makes the call idempotent: the same reference never creates a second order. */
  reference: z.string().regex(/^AIS-[A-Z0-9]{6}$/),
});

const summary = (o: { id: string; orderNumber: number; totalPrice: unknown }, currency: string) => ({
  id: o.id,
  orderNumber: o.orderNumber,
  total: Number(o.totalPrice),
  currency,
});

// POST /api/public/v1/orders  -> 201 { id, orderNumber, total, currency }   (200 when the reference already exists)
export async function POST(req: Request) {
  const ctx = await authenticate(req);
  if (isResponse(ctx)) return ctx;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(400, "INVALID_JSON", "Body must be JSON.");
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return apiError(400, "INVALID_BODY", parsed.error.issues[0]?.message ?? "Invalid body.");
  const d = parsed.data;
  const startAt = new Date(d.start);
  const endAt = new Date(d.end);
  if (endAt <= startAt) return apiError(400, "INVALID_BODY", "end must be after start.");

  const store = await prisma.store.findUniqueOrThrow({ where: { id: ctx.storeId }, select: { currency: true } });

  // Idempotency: the reference is in the order notes, so a retry finds the order it already made.
  const existing = await prisma.order.findFirst({
    where: { storeId: ctx.storeId, channel: "ONLINE", notes: { contains: d.reference } },
    select: { id: true, orderNumber: true, totalPrice: true },
  });
  if (existing) return json(summary(existing, store.currency), 200);

  const variant = await prisma.productVariant.findFirst({ where: { id: d.variantId, productId: d.productId, storeId: ctx.storeId }, select: { id: true } });
  if (!variant) return apiError(404, "NOT_FOUND", "Unknown product or variant.");

  try {
    const order = await createOrder(ctx.storeId, ctx.actorUserId, {
      persons: [{ name: d.customer.name, email: d.customer.email, phone: d.customer.phone, isLiableCustomer: true }],
      startAt,
      endAt,
      deliveryRequired: false,
      returnMethod: "STORE",
      channel: "ONLINE",
      // Always starts with the website marker (DELETE relies on it), without doubling it if the caller already added it.
      notes: d.notes?.startsWith(`${WEBSITE_NOTE_PREFIX} ${d.reference}`) ? d.notes : [`${WEBSITE_NOTE_PREFIX} ${d.reference}`, d.notes].filter(Boolean).join(" | "),
      bookNow: false,
      // The website enforces the studio's own opening hours per package. The store's pickup hours (for equipment) do not apply.
      allowOutsideHours: true,
      lines: [{ variantId: d.variantId, quantity: 1 }],
    });
    logger.info({ orderId: order.id, reference: d.reference }, "public api: website booking created");
    return json(summary(order, store.currency), 201);
  } catch (err) {
    if (err instanceof InsufficientAvailabilityError) return apiError(409, "CONFLICT", "That time is no longer available.");
    if (err instanceof NoPriceTierError) return apiError(422, "NO_PRICE", "This variant has no price for that duration.");
    logger.error({ err, reference: d.reference }, "public api: order creation failed");
    return apiError(500, "INTERNAL", "Could not create the order.");
  }
}
